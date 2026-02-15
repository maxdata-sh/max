import {
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

import { flag, parseSync, passThrough } from '@optique/core'
import { object, or } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { withDefault } from '@optique/core/modifiers'
import { string } from '@optique/core/valueparser'
import { ProjectCompleters } from './parsers/project-completers.js'
import * as fs from 'node:fs'

import { LazyOne, LazyX, makeLazy, MaxError } from '@max/core'
import { CliPrinter } from './cli-printable.js'
import { SchemaPrinters } from './printers/schema-printers.js'
import * as path from 'node:path'
import { createSocketServer } from './socket-server.js'
import { CliResponse } from './types.js'
import { parseAndValidateArgs } from './argv-parser.js'
import { daemonCommand } from './commands/daemon-command.js'
import { schemaCommandBuild } from './commands/schema-command.js'
import { initCommand } from './commands/init-command.js'
import { DaemonPrinters } from './printers/daemon-printers.js'
import { Mode, Parser } from '@optique/core/parser'

//FIXME: CLAUDE: I'd like to do some general cleanup on this file - it's a little busy
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

class CLI {
  constructor(public cfg: GlobalConfig) {
    this.cliPrinter = new CliPrinter({ color: cfg.useColor })
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

  runInit(arg: CmdInput<'init'>) {
    const dir = path.resolve(arg.directory)
    return this.global.initProjectAtPath({
      force: arg.force,
      path: dir,
    })
  }

  async runSchema(arg: CmdInput<'schema'>) {
    const result = await this.project.connectorRegistry.resolve(arg.source)
    const schema = result.def.schema
    switch (arg.output) {
      default:
      case 'text':
        return this.cliPrinter.print(SchemaPrinters.SchemaText, schema)
      case 'json':
        return this.cliPrinter.print(SchemaPrinters.SchemaJson, schema)
      case 'ndjson':
        return this.cliPrinter.print(SchemaPrinters.SchemaJsonl, schema)
    }
  }

  runDaemon(arg: CmdInput<'daemon'>) {
    const daemon = this.project.daemonManager
    const printStatus = () => this.cliPrinter.print(DaemonPrinters.DaemonStatus, daemon.status())

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
        return this.cliPrinter.printAll(DaemonPrinters.DaemonEntry, results)
      }
      case 'restart': {
        daemon.stop()
        daemon.start()
        return printStatus()
      }
      default:
        // FIXME: CLAUDE: This needs a real error at the boundary (unexpected command / unhandled branch / something very "invariant volationy")
        throw new Error('Unhandled command')
    }
  }

  private cliPrinter: CliPrinter

  async parseAndExecute(args: readonly string[], cwd = process.cwd()): Promise<CliResponse> {
    const parsed = await parseAndValidateArgs(this.program.get, 'max', args, this.cfg.useColor)

    if (!parsed.ok) {
      return parsed.response
    }

    const instruction = parsed.value

    const result = await (async () => {
      switch (instruction.cmd) {
        case 'schema':
          return this.runSchema(instruction)
        case 'init':
          return this.runInit(instruction)
        case 'daemon':
          return this.runDaemon(instruction)
      }

      // FIXME: CLAUDE: This needs a real error at the boundary
      throw new Error('Unhandled command')
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

    // FIXME: CLAUDE: Need to check: Is the daemon disabled, is it already running?

    createSocketServer({
      socketPath: daemonPaths.socket,
      runner: async (req) => {
        if (req.kind === 'run') {
          return cli.parseAndExecute(req.argv, req.cwd).catch((err) => {
            const msg = MaxError.isMaxError(err)
              ? err.prettyPrint({ color: true })
              : err instanceof Error
                ? err.message
                : String(err)
            return { stderr: `${msg}\n`, exitCode: 1 }
          })
        } else {
          throw 'not done yet'
        }
      },
    })

    console.log(`Max daemon listening on ${daemonPaths.socket}`)
  } else {
    await cli.parseAndExecute(parsed.value.maxCommand).then(
      (response) => {
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
