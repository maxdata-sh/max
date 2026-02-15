import {
  ErrDaemonDisabled,
  ErrInvariant,
  ErrProjectNotInitialised,
  FsConnectorRegistry,
  FsProjectManager,
  GlobalConfig,
  MaxGlobalApp,
  MaxGlobalAppDependencies,
  MaxProjectApp,
  MaxProjectAppDependencies,
  ProjectConfig,
  ProjectDaemonManager,
} from '@max/app'

import * as Completion from '@optique/core/completion'
import {print} from '@optique/run'
import { flag, parseSync, passThrough } from '@optique/core'
import { object, or } from '@optique/core/constructs'
import {argument, constant, option } from '@optique/core/primitives'
import { optional, withDefault } from '@optique/core/modifiers'
import {choice, string } from '@optique/core/valueparser'
import { suggestAsync, type Suggestion } from '@optique/core/parser'
import { ProjectCompleters } from './parsers/project-completers.js'
import * as fs from 'node:fs'

import { LazyOne, LazyX, makeLazy, MaxError } from '@max/core'
import { CliPrinter } from './cli-printable.js'
import { SchemaPrinters } from './printers/schema-printers.js'
import * as path from 'node:path'
import { createSocketServer } from './socket-server.js'
import { CliRequest, CliResponse } from './types.js'
import { parseAndValidateArgs } from './argv-parser.js'
import { daemonCommand } from './commands/daemon-command.js'
import { schemaCommandBuild } from './commands/schema-command.js'
import { initCommand } from './commands/init-command.js'
import { DaemonPrinters } from './printers/daemon-printers.js'
import { Mode, Parser } from '@optique/core/parser'
import {ShellCompletion} from "@optique/core/completion";
import {message} from "@optique/core/message";

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
}


class Commands {
  constructor(private projectCompleters: LazyOne<ProjectCompleters>) {}
  all = makeLazy({
    schema: () => schemaCommandBuild({ completers: this.projectCompleters.get }),
    daemon: () => daemonCommand,
    init: () => initCommand,
  })
}

type ParserResultType<X extends Parser<Mode>> =
  X extends Parser<Mode, infer TValue> ? TValue : never
type CmdInput<k extends keyof Commands['all']> = ParserResultType<Commands['all'][k]>

interface RequestContext {
  cwd: string
  color: boolean
}

class CLI {
  constructor(public cfg: GlobalConfig) {
    const globalDeps: MaxGlobalAppDependencies = makeLazy<MaxGlobalAppDependencies>({
      config: () => cfg,
    })
    this.global = new MaxGlobalApp(globalDeps)
    const projectDeps: MaxProjectAppDependencies = makeLazy<MaxProjectAppDependencies>({
      daemonManager: () => new ProjectDaemonManager(projectDeps.projectConfig),
      projectManager: () => new FsProjectManager(projectDeps.projectConfig.paths.projectRootPath),
      projectConfig: () => {
        const projectRoot = cfg.projectRoot
        const projectExists = projectRoot && fs.existsSync(projectRoot)
        if (!projectRoot || !projectExists) {
          throw ErrProjectNotInitialised.create({ maxProjectRoot: projectRoot ?? cfg.cwd })
        }
        return new ProjectConfig(cfg, { projectRootFolder: projectRoot })
      },
      connectorRegistry: () =>
        new FsConnectorRegistry({
          acme: '@max/connector-acme',
          linear: '@max/connector-linear',
        }),
    })

    this.project = new MaxProjectApp(projectDeps)
    this.commands = new Commands(LazyX.once(() => new ProjectCompleters(this.project)))
  }

  global: MaxGlobalApp
  project: MaxProjectApp
  commands: Commands

  program = LazyX.once(() =>
    or(
      //
      this.commands.all.daemon,
      this.commands.all.schema,
      this.commands.all.init
    )
  )

  runInit(arg: CmdInput<'init'>, req: RequestContext) {
    const dir = path.resolve(arg.directory)
    return this.global.initProjectAtPath({
      force: arg.force,
      path: dir,
    })
  }

  async runSchema(arg: CmdInput<'schema'>, req: RequestContext) {
    const printer = this.printerFor(req.color)
    const schema = await this.project.getSchema(arg.source)
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

  runDaemon(arg: CmdInput<'daemon'>, req: RequestContext) {
    const printer = this.printerFor(req.color)
    const daemon = this.project.daemonManager
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
    const args: [string, ...string[]] = argv.length > 0
      ? (argv as unknown as [string, ...string[]])
      : ['']
    try {
      return await suggestAsync(this.program.get, args)
    } catch {
      return []
    }
  }

  async parseAndExecute(args: readonly string[], opts?: Partial<RequestContext>): Promise<CliResponse> {
    const req: RequestContext = {
      cwd: opts?.cwd ?? process.cwd(),
      color: opts?.color ?? this.cfg.useColor,
    }
    const parsed = await parseAndValidateArgs(this.program.get, 'max', args, req.color)

    if (!parsed.ok) {
      return parsed.response
    }

    const instruction = parsed.value

    const result = await (async () => {
      switch (instruction.cmd) {
        case 'schema':
          return this.runSchema(instruction, req)
        case 'init':
          return this.runInit(instruction, req)
        case 'daemon':
          return this.runDaemon(instruction, req)
      }

      throw ErrInvariant.create({ detail: `Unhandled command: ${instruction.cmd}` })
    })()

    const withNewline = result ? result.concat('\n') : ''
    return { exitCode: 0, stdout: withNewline }
  }
}

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

    const daemonPaths = cli.project.config.paths.daemon
    const daemonStatus = cli.project.daemonManager.status()

    if (!daemonStatus.enabled) {
      console.error(ErrDaemonDisabled.create({}).prettyPrint({ color: cfg.useColor }))
      process.exit(1)
    }

    if (daemonStatus.alive) {
      console.error(`Daemon already running (pid ${daemonStatus.pid})`)
      process.exit(0)
    }

    createSocketServer({
      socketPath: daemonPaths.socket,
      runner: async (req) => {
        const color = req.color ?? false
        return cli.parseAndExecute(req.argv, { cwd: req.cwd, color }).catch((err) => {
          const msg = MaxError.isMaxError(err)
            ? err.prettyPrint({ color })
            : err instanceof Error
              ? err.message
              : String(err)
          return { stderr: `${msg}\n`, exitCode: 1 }
        })
      },
      suggest: (argv) => {
        return cli.suggest(argv)
      },
    })

    console.log(`Max daemon listening on ${daemonPaths.socket}`)
  } else {
    const response = cli.parseAndExecute(parsed.value.maxCommand, { cwd: process.cwd() })

    await response.then(
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
  print(parsed.error)
  throw new Error(parsed.error.join('\n'))
}

