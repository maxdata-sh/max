import {
  ErrInvariant,
  type WorkspaceClient,
} from '@max/federation'
import {
  ErrCannotInitialiseProject,
  ErrDaemonDisabled,
  ErrProjectNotInitialised,
  findProjectRoot,
  GlobalConfig,
  ProjectConfig,
  BunInProcessWorkspaceProvider,
  initProject,
} from '@max/platform-bun'
import { InMemoryCredentialStore } from '@max/connector'

import * as Completion from '@optique/core/completion'
import { ShellCompletion } from '@optique/core/completion'
import { flag, parseSync, passThrough } from '@optique/core'
import { group, object, or } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { withDefault } from '@optique/core/modifiers'
import { string } from '@optique/core/valueparser'
import { Mode, Parser, suggestAsync, type Suggestion } from '@optique/core/parser'
import { ProjectCompleters } from './parsers/project-completers.js'
import * as fs from 'node:fs'

import { LazyOne, LazyX, makeLazy, MaxError } from '@max/core'
import { CliPrinter } from './cli-printable.js'
import { Fmt } from '@max/core'
import { SchemaPrinters } from './printers/schema-printers.js'
import * as path from 'node:path'
import { createSocketServer } from './socket-server.js'
import { CliRequest, CliResponse } from './types.js'
import { parseAndValidateArgs } from './argv-parser.js'
import { daemonCommand } from './commands/daemon-command.js'
import { schemaCommandBuild } from './commands/schema-command.js'
import { connectCommandBuild } from './commands/connect-command.js'
import { initCommand } from './commands/init-command.js'
import { syncCommandBuild } from './commands/sync-command.js'
import { runOnboarding } from './onboarding-runner.js'
import { DirectPrompter, type Prompter } from './prompter.js'
// import { DaemonPrinters } from './printers/daemon-printers.js' // Temporarily disabled during federation migration
import { runSubprocess, subprocessParsers } from './subprocess-entry.js'

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
}

// FIXME: Connector registry should be configurable, not hardcoded
const KNOWN_CONNECTORS: Record<string, string> = {
  acme: '@max/connector-acme',
  linear: '@max/connector-linear',
}

class Commands {
  constructor(private projectCompleters: LazyOne<ProjectCompleters>) {}
  all = makeLazy({
    schema: () => schemaCommandBuild({ completers: this.projectCompleters.get }),
    connect: () => connectCommandBuild({ completers: this.projectCompleters.get }),
    sync: () => syncCommandBuild({ completers: this.projectCompleters.get }),
    daemon: () => daemonCommand,
    init: () => initCommand,
  })
}


type ParserResultType<X extends Parser<Mode>> =
  X extends Parser<Mode, infer TValue> ? TValue : never
type CmdInput<k extends keyof Commands['all']> = ParserResultType<Commands['all'][k]>

class CLI {
  constructor(public cfg: GlobalConfig) {
    this.commands = new Commands(
      LazyX.once(
        () => new ProjectCompleters(() => this.lazy.workspace, Fmt.from(cfg.useColor ?? true))
      )
    )
  }

  commands: Commands

  lazy = makeLazy({
    /** Create a WorkspaceClient */
    workspace: async (): Promise<WorkspaceClient> => {
      const projectRoot = this.cfg.projectRoot
      if (!projectRoot || !fs.existsSync(path.join(projectRoot, 'max.json'))) {
        throw ErrProjectNotInitialised.create({ maxProjectRoot: projectRoot ?? this.cfg.cwd })
      }
      const provider = new BunInProcessWorkspaceProvider()
      return provider
        .create({
          projectRoot,
          connectors: KNOWN_CONNECTORS,
        })
        .then((handle) => handle.client)
    },
    /** Create a ProjectConfig */
    projectConfig: (): ProjectConfig => {
      const projectRoot = this.cfg.projectRoot
      if (!projectRoot || !fs.existsSync(projectRoot)) {
        throw ErrProjectNotInitialised.create({ maxProjectRoot: projectRoot ?? this.cfg.cwd })
      }
      return new ProjectConfig(this.cfg, { projectRootFolder: projectRoot })
    },

  })


  // -- Program parser ---------------------------------------------------------

  program = LazyX.once(() =>
    or(
      //
      group(
        'project',
        or(
          this.commands.all.init,
          this.commands.all.connect,
          this.commands.all.sync,
          this.commands.all.schema
        )
      ),
      group('system', this.commands.all.daemon)
    )
  )

  // -- Command handlers -------------------------------------------------------

  runInit(arg: CmdInput<'init'>) {
    const dir = path.resolve(arg.directory)
    const existingRoot = findProjectRoot(dir)

    if (existingRoot && !arg.force) {
      throw ErrCannotInitialiseProject.create(
        { maxProjectRoot: existingRoot },
        'you are already in a max project! Use `force=true` to create one here anyway.'
      )
    }

    initProject(dir)
  }

  async runSchema(arg: CmdInput<'schema'>, color: boolean) {
    const printer = this.printerFor(color)
    const ws = await this.lazy.workspace
    const schema = await ws.connectorSchema(arg.source)
    switch (arg.output) {
      default:
      case 'text':
        return printer.print(SchemaPrinters.SchemaText, schema)
      case 'json':
        return printer.print(SchemaPrinters.SchemaJson, schema)
      case 'ndjson':
        return printer.print(SchemaPrinters.SchemaJsonl, schema)
    }
  }

  async runConnect(arg: CmdInput<'connect'>, prompter?: Prompter) {
    const ws = await this.lazy.workspace
    const flow = await ws.connectorOnboarding(arg.source)

    // Collect credentials into an in-memory store during onboarding
    const memStore = new InMemoryCredentialStore()
    const ownedPrompter = prompter ? null : new DirectPrompter()
    const resolved = prompter ?? ownedPrompter!
    try {
      const config = await runOnboarding(flow, { credentialStore: memStore }, resolved)

      // Dump collected credentials for atomic installation creation
      const credentialKeys = await memStore.keys()
      const initialCredentials: Record<string, string> = {}
      for (const key of credentialKeys) {
        initialCredentials[key] = await memStore.get(key)
      }

      const id = await ws.createInstallation({
        spec: {
          connector: arg.source,
          connectorConfig: config,
          initialCredentials: credentialKeys.length > 0 ? initialCredentials : undefined,
        },
      })

      return `Connected ${arg.source} as installation ${id}`
    } finally {
      ownedPrompter?.close()
    }
  }

  async runSync(arg: CmdInput<'sync'>, color: boolean) {
    const printer = this.printerFor(color)
    const ws = await this.lazy.workspace
    const [connector, name] = arg.target

    // Find installation by connector + name
    const installations = await ws.listInstallations()
    const match = installations.find(
      (i) => i.connector === connector && (name ? i.name === name : true)
    )
    if (!match) {
      throw ErrInvariant.create({
        detail: `No installation found for ${connector}${name ? `:${name}` : ''}`,
      })
    }

    const installation = ws.installation(match.id)
    if (!installation) {
      throw ErrInvariant.create({ detail: `Installation ${match.id} registered but not running` })
    }

    const handle = await installation.sync()
    const result = await handle.completion()

    await installation.stop()

    const lines = [
      `Sync ${result.status} in ${result.duration}ms`,
      `  Tasks completed: ${result.tasksCompleted}`,
      `  Tasks failed:    ${result.tasksFailed}`,
    ]
    return lines.join('\n')
  }

  runDaemon(_arg: CmdInput<'daemon'>, _color: boolean) {
    // Daemon subcommands (start/stop/enable/disable/list) are temporarily
    // unavailable. The FsProjectDaemonManager has been retired as part of
    // the federation migration. These commands will be re-implemented via
    // GlobalMax + workspace supervisor + workspace registry.
    throw ErrInvariant.create({
      detail: `Daemon commands are temporarily unavailable during federation migration`,
    })
  }

  // -- Shared utilities -------------------------------------------------------

  private colorPrinter = new CliPrinter({ color: true })
  private plainPrinter = new CliPrinter({ color: false })

  private printerFor(color: boolean) {
    return color ? this.colorPrinter : this.plainPrinter
  }

  async suggest(req: CliRequest): Promise<CliResponse> {
    const suggestions = await this.getSuggestions(req.argv)
    const shell = req.shell && shells[req.shell]
    if (shell) {
      const chunks: string[] = []
      for (const chunk of shell.encodeSuggestions(suggestions)) {
        chunks.push(chunk)
      }
      return { exitCode: 0, completionOutput: chunks.join('\n') }
    }
    const completions = suggestions.filter((s) => s.kind === 'literal').map((s) => s.text)
    return { exitCode: 0, completions }
  }

  async getSuggestions(argv: readonly string[]): Promise<readonly Suggestion[]> {
    const args: [string, ...string[]] =
      argv.length > 0 ? (argv as unknown as [string, ...string[]]) : ['']
    try {
      return await suggestAsync(this.program.get, args)
    } catch {
      return []
    }
  }

  async execute(req: CliRequest, prompter?: Prompter): Promise<CliResponse> {
    if (req.kind === 'complete') {
      return this.suggest(req)
    }

    const color = req.color ?? this.cfg.useColor ?? true
    const parsed = await parseAndValidateArgs(this.program.get, 'max', req.argv, color)

    if (!parsed.ok) {
      return parsed.response
    }

    const instruction = parsed.value

    const result = await (async () => {
      switch (instruction.cmd) {
        case 'schema':
          return this.runSchema(instruction, color)
        case 'connect':
          return this.runConnect(instruction, prompter)
        case 'sync':
          return this.runSync(instruction, color)
        case 'init':
          return this.runInit(instruction)
        case 'daemon':
          return this.runDaemon(instruction, color)
      }

      // @ts-expect-error: cmd should be `never` if we've covered all codepaths above
      throw ErrInvariant.create({ detail: `Unhandled command: ${instruction.cmd}` })
    })()

    const withNewline = result ? result.concat('\n') : ''
    return { exitCode: 0, stdout: withNewline }
  }
}

// ============================================================================
// Subprocess mode — early exit if --subprocess is present
// ============================================================================

const subprocessParsed = parseSync(subprocessParsers, process.argv.slice(2))
if (subprocessParsed.success && subprocessParsed.value.subprocess) {
  await runSubprocess(subprocessParsed.value)
} else {
// ============================================================================
// Normal CLI mode
// ============================================================================

const rustShimParsers = object({
  devMode: withDefault(flag('--dev-mode'), () => process.env.MAX_DEV_MODE === 'true'),
  projectRoot: withDefault(option('--project-root', string()), () => process.cwd()),
  daemonized: withDefault(flag('--daemonized'), false),
  maxCommand: passThrough({ format: 'greedy' }),
})

const parsed = parseSync(rustShimParsers, process.argv.slice(2))

if (parsed.success) {
  const cfg = new GlobalConfig({
    devMode: parsed.value.devMode,
    projectRoot: parsed.value.projectRoot,
    cwd: process.cwd(),
    mode: parsed.value.daemonized ? 'daemon' : 'direct',
  })

  const cli = new CLI(cfg)

  if (cfg.mode === 'daemon') {
    if (!cfg.projectRoot) {
      console.error('Cannot daemonize without a project root')
      process.exit(1)
    }

    const projectConfig = new ProjectConfig(cfg, { projectRootFolder: cfg.projectRoot })
    const daemonPaths = projectConfig.paths.daemon

    // Guard: check if daemon is disabled
    if (fs.existsSync(daemonPaths.disabled)) {
      console.error(ErrDaemonDisabled.create({}).prettyPrint({ color: cfg.useColor }))
      process.exit(1)
    }

    // Guard: check if daemon is already running (read PID, check liveness)
    try {
      const pidRaw = fs.readFileSync(daemonPaths.pid, 'utf-8').trim()
      const existingPid = parseInt(pidRaw, 10)
      if (!isNaN(existingPid)) {
        try {
          process.kill(existingPid, 0) // signal 0 = liveness check
          console.error(`Daemon already running (pid ${existingPid})`)
          process.exit(0)
        } catch {
          // Process not alive — stale PID file, continue startup
        }
      }
    } catch {
      // No PID file — continue startup
    }

    // Write our own PID — works regardless of who spawned us (Rust shim or `max daemon start`)
    // and survives `bun --watch` restarts which change the child PID.
    fs.mkdirSync(daemonPaths.root, { recursive: true })
    fs.writeFileSync(daemonPaths.pid, String(process.pid))

    createSocketServer({
      socketPath: daemonPaths.socket,
      handler: (req, prompter) =>
        cli.execute(req, prompter).catch((err) => {
          const color = req.color ?? false
          const msg = MaxError.isMaxError(err)
            ? err.prettyPrint({ color })
            : err instanceof Error
              ? err.message
              : String(err)
          return { stderr: `${msg}\n`, exitCode: 1 }
        }),
    })

    console.log(`Max daemon listening on ${daemonPaths.socket}`)
  } else {
    const req: CliRequest = {
      kind: 'run',
      argv: parsed.value.maxCommand,
      cwd: process.cwd(),
      color: cfg.useColor,
    }

    await cli.execute(req).then(
      (response) => {
        if (response.completionOutput) process.stdout.write(response.completionOutput)
        if (response.stdout) process.stdout.write(response.stdout)
        if (response.stderr) process.stderr.write(response.stderr)
        process.exit(response.exitCode)
      },
      (err) => {
        console.error(err)
        process.exit(1)
      }
    )
  }
} else {
  console.error('Unexpected error')
  throw new Error(parsed.error.join('\n'))
}

} // end subprocess else
