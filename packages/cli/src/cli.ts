/**
 * CLI — The dispatch engine.
 *
 * Owns the GlobalMax lifecycle, target derivation, context resolution,
 * command lookup, parsing, and execution. Stateless per-request: each
 * execute() call creates fresh CliServices and Commands for the resolved
 * context.
 *
 * The harness (process argv parsing, daemon mode, socket server) lives
 * in main.ts. This file is pure logic, no process-level side effects.
 */

import { GlobalMax } from '@max/federation'
import { BunPlatform, GlobalConfig } from '@max/platform-bun'

import * as Completion from '@optique/core/completion'
import { ShellCompletion } from '@optique/core/completion'
import { group, or } from '@optique/core/constructs'
import { command as cmd, constant } from '@optique/core/primitives'
import { suggestAsync, type Suggestion } from '@optique/core/parser'
import { message } from '@optique/core/message'

import { LazyX, makeLazy, MaxUrlLevel } from '@max/core'
import { CliRequest, CliResponse } from './types.js'
import { parseAndValidateArgs } from './argv-parser.js'
import { type Prompter } from './prompter.js'
import { toContext, ResolvedContext } from './resolved-context.js'
import { deriveTarget } from './resolve-context.js'
import { CliServices } from './cli-services.js'
import { ErrCommandNotAtLevel } from './errors.js'

import { CmdInit } from './commands/init-command.js'
import { CmdConnect } from './commands/connect-command.js'
import { CmdSchemaInstallation, CmdSchemaWorkspace } from './commands/schema-command.js'
import { CmdSyncInstallation, CmdSyncWorkspace } from './commands/sync-command.js'
import { CmdDaemon } from './commands/daemon-command.js'
import { Command } from './command.js'

// ============================================================================
// Shell completion codecs
// ============================================================================

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
}

// ============================================================================
// Command blocks — level-grouped command factories
// ============================================================================

/** Extract the first non-flag argument — the command name. */
function findCommandName(argv: readonly string[]): string | undefined {
  for (const arg of argv) {
    if (!arg.startsWith('-')) return arg
  }
  return undefined
}

interface CommandBlock {
  level: MaxUrlLevel
  all: { [key: string]: Command }
}

class GlobalCommands implements CommandBlock {
  level = 'global' as const
  constructor(private services: CliServices<'global'>) {}
  all = makeLazy({
    init: () => new CmdInit(this.services),
    daemon: () => new CmdDaemon(this.services),
  })
}

class WorkspaceCommands implements CommandBlock {
  level = 'workspace' as const
  constructor(private services: CliServices<'workspace'>) {}
  all = makeLazy({
    daemon: () => new CmdDaemon(this.services),
    connect: () => new CmdConnect(this.services),
    schema: () => new CmdSchemaWorkspace(this.services),
    sync: () => new CmdSyncWorkspace(this.services),
  })
}

class InstallationCommands implements CommandBlock {
  level = 'installation' as const
  constructor(private services: CliServices<'installation'>) {}
  all = makeLazy({
    schema: () => new CmdSchemaInstallation(this.services),
    sync: () => new CmdSyncInstallation(this.services),
  })
}

class Commands {
  global: GlobalCommands
  workspace: WorkspaceCommands
  installation: InstallationCommands
  constructor(services: CliServices<any>) {
    this.global = new GlobalCommands(services)
    this.workspace = new WorkspaceCommands(services)
    this.installation = new InstallationCommands(services)
  }

  resolve(name: string, context: ResolvedContext) {
    const target = this[context.level] as CommandBlock
    if (name in target.all) {
      return target.all[name]
    } else {
      const supportedLevels = [this.global, this.workspace, this.installation]
        .filter((i) => name in i.all)
        .map((i) => i.level)
      throw ErrCommandNotAtLevel.create({
        command: name,
        level: context.level,
        url: context.url.toString(),
        supportedLevels: supportedLevels,
      })
    }
  }

  program = LazyX.once(() =>
    or(
      group('global', or(this.global.all.init.parser.get, this.global.all.daemon.parser.get)),
      group(
        'workspace',
        or(
          this.workspace.all.schema.parser.get,
          this.workspace.all.connect.parser.get,
          this.workspace.all.sync.parser.get
        )
      ),
      group(
        'installation',
        or(this.installation.all.schema.parser.get, this.installation.all.sync.parser.get)
      ),
      group(
        'system',
        cmd('daemon', constant('daemon'), {
          description: message`Manage the background daemon process`,
        })
      )
    )
  )
}

// ============================================================================
// CLI
// ============================================================================

export interface CliOptions {
  /** Pre-built GlobalMax — skips creation and start. Used for testing. */
  globalMax?: GlobalMax
}

export class CLI {
  constructor(
    public cfg: GlobalConfig,
    private opts?: CliOptions,
  ) {}

  lazy = makeLazy({
    globalUnstarted: (): GlobalMax =>
      this.opts?.globalMax ?? BunPlatform.createGlobalMax(),
    globalStarted: async (): Promise<GlobalMax> => {
      if (this.opts?.globalMax) return this.opts.globalMax
      const max = this.lazy.globalUnstarted
      await max.start()
      return max
    },
  })

  async suggest(req: CliRequest, commands: Commands): Promise<CliResponse> {
    return this.getSuggestions(req.argv, commands).then(
      (suggestions) => {
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
      },
      (error): CliResponse => {
        return { exitCode: 1, stderr: error, completionOutput: 'Ah fuckles' }
      }
    )
  }

  async getSuggestions(
    argv: readonly string[],
    commands: Commands
  ): Promise<readonly Suggestion[]> {
    const args: [string, ...string[]] =
      argv.length > 0 ? (argv as unknown as [string, ...string[]]) : ['']
    return await suggestAsync(commands.program.get, args)
  }

  // -- Dispatch --------------------------------------------------------------

  async execute(req: CliRequest, prompter?: Prompter): Promise<CliResponse> {
    const color = req.color ?? this.cfg.useColor ?? true

    // Derive target (sync, no daemon)
    const { target, argv } = deriveTarget(req.argv, req.cwd ?? this.cfg.cwd)

    // Resolve target to clients (needs daemon)
    const globalMax = await this.lazy.globalStarted
    const resolved = globalMax.maxUrlResolver().resolve(target)
    const ctx = toContext(resolved, target)

    // Create per-request services + commands
    const services = new CliServices(ctx, color)
    const commands = new Commands(services)

    if (req.kind === 'complete') {
      return this.suggest(req, commands)
    }

    // Find command name
    const commandName = findCommandName(argv)
    if (!commandName) return this.executeLegacy(req, color, commands)

    let command: Command
    try {
      command = commands.resolve(commandName, ctx)
    } catch (e) {
      if (ErrCommandNotAtLevel.is(e)) {
        return await this.executeLegacy(req, color, commands)
      } else {
        throw e
      }
    }

    // Parse + execute
    const parsed = await parseAndValidateArgs(command.parser.get, 'max', argv, color)
    if (!parsed.ok) return parsed.response

    const result = await command.run(parsed.value, { color, prompter })
    return { exitCode: 0, stdout: result ? result + '\n' : '' }
  }

  /**
   * Legacy parse path — handles bare `max` and `max --help`.
   * Will be replaced by default-to-status once the status command exists.
   */
  private async executeLegacy(
    req: CliRequest,
    color: boolean,
    commands: Commands
  ): Promise<CliResponse> {
    const parsed = await parseAndValidateArgs(commands.program.get, 'max', req.argv, color)
    if (!parsed.ok) return parsed.response
    return { exitCode: 0, stdout: '' }
  }
}
