import {
  ErrCannotInitialiseProject,
  ErrDaemonDisabled,
  ErrInvariant,
  ErrProjectNotInitialised,
  findProjectRoot,
  FsProjectDaemonManager,
  FsProjectManager,
  GlobalConfig,
  ProjectConfig,
  type WorkspaceClient,
} from '@max/federation'
import { InMemoryCredentialStore } from '@max/connector'
import { BunInProcessWorkspaceProvider } from '@max/platform-bun'

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
import { CliPrinter, Fmt } from './cli-printable.js'
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
import { DaemonPrinters } from './printers/daemon-printers.js'
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
      LazyX.once(() => new ProjectCompleters(
        () => this.getWorkspace(),
        new Fmt(cfg.useColor ?? true),
      ))
    )
  }

  commands: Commands

  // -- Workspace (lazy, created on first use) ---------------------------------

  private _workspace: Promise<WorkspaceClient> | null = null

  private getWorkspace(): Promise<WorkspaceClient> {
    if (!this._workspace) {
      const projectRoot = this.cfg.projectRoot
      if (!projectRoot || !fs.existsSync(path.join(projectRoot, 'max.json'))) {
        throw ErrProjectNotInitialised.create({ maxProjectRoot: projectRoot ?? this.cfg.cwd })
      }
      const provider = new BunInProcessWorkspaceProvider()
      this._workspace = provider.create({
        projectRoot,
        connectors: KNOWN_CONNECTORS,
      }).then(handle => handle.client)
    }
    return this._workspace
  }

  // -- Daemon management (process-level, not workspace-level) -----------------

  private _projectConfig: ProjectConfig | null = null

  private getProjectConfig(): ProjectConfig {
    if (!this._projectConfig) {
      const projectRoot = this.cfg.projectRoot
      if (!projectRoot || !fs.existsSync(projectRoot)) {
        throw ErrProjectNotInitialised.create({ maxProjectRoot: projectRoot ?? this.cfg.cwd })
      }
      this._projectConfig = new ProjectConfig(this.cfg, { projectRootFolder: projectRoot })
    }
    return this._projectConfig
  }

  private _daemonManager: FsProjectDaemonManager | null = null

  private getDaemonManager(): FsProjectDaemonManager {
    if (!this._daemonManager) {
      this._daemonManager = new FsProjectDaemonManager(this.getProjectConfig())
    }
    return this._daemonManager
  }

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

    FsProjectManager.init(dir)
  }

  async runSchema(arg: CmdInput<'schema'>, color: boolean) {
    const printer = this.printerFor(color)
    const ws = await this.getWorkspace()
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
    const ws = await this.getWorkspace()
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
    const ws = await this.getWorkspace()
    const [connector, name] = arg.target

    // Find installation by connector + name
    const installations = await ws.listInstallations()
    const match = installations.find(
      i => i.connector === connector && (name ? i.name === name : true)
    )
    if (!match) {
      throw ErrInvariant.create({ detail: `No installation found for ${connector}${name ? `:${name}` : ''}` })
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

  runDaemon(arg: CmdInput<'daemon'>, color: boolean) {
    const printer = this.printerFor(color)
    const daemon = this.getDaemonManager()
    const printStatus = () => printer.print(DaemonPrinters.DaemonStatus, daemon.status())

    switch (arg.sub) {
      case 'status':
        return printStatus()
      case 'start': {
        daemon.start()
        return printStatus()
      }
      case 'stop': {
        daemon.stop()
        return printStatus()
      }
      case 'enable': {
        daemon.enable()
        return printStatus()
      }
      case 'disable': {
        daemon.disable()
        return printStatus()
      }
      case 'list': {
        const results = daemon.list()
        return printer.printAll(DaemonPrinters.DaemonEntry, results)
      }
      case 'restart': {
        daemon.stop()
        daemon.start()
        return printStatus()
      }
      default:
        throw ErrInvariant.create({ detail: `Unhandled daemon subcommand: ${arg.sub}` })
    }
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
    const daemonManager = new FsProjectDaemonManager(projectConfig)
    const daemonStatus = daemonManager.status()

    if (!daemonStatus.enabled) {
      console.error(ErrDaemonDisabled.create({}).prettyPrint({ color: cfg.useColor }))
      process.exit(1)
    }

    if (daemonStatus.alive) {
      // TODO: This should be logged via a daemon file logger, not console.error.
      // stderr is inherited from the spawning process and may write to a terminal
      // that has already moved on. See roadmap: daemon logger.
      console.error(`Daemon already running (pid ${daemonStatus.pid})`)
      process.exit(0)
    }

    // Write our own PID — works regardless of who spawned us (Rust shim or `max daemon start`)
    // and survives `bun --watch` restarts which change the child PID.
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
