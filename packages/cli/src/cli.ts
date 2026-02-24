/**
 * CLI — The dispatch engine.
 *
 * Uses optique's `conditional` combinator to route commands based on the
 * resolved target level. The cwd context is pre-populated as the default
 * branch; -t overrides it via the level resolver discriminator.
 *
 * The harness (process argv parsing, daemon mode, socket server) lives
 * in main.ts. This file is pure logic, no process-level side effects.
 */

import { GlobalMax } from '@max/federation'
import { BunPlatform, GlobalConfig } from '@max/platform-bun'

import * as Completion from '@optique/core/completion'
import { ShellCompletion } from '@optique/core/completion'
import { conditional, or } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { Mode, Parser, suggestAsync, type Suggestion } from '@optique/core/parser'

import { LazyX, LazyOne, makeLazy, MaxUrlLevel, MaxError } from '@max/core'
import { CliRequest, CliResponse } from './types.js'
import { parseAndValidateArgs } from './argv-parser.js'
import { type Prompter } from './prompter.js'
import { toContext, ContextAt } from './resolved-context.js'
import { detectCwdContext, cwdToMaxUrl, normalizeGlobalFlag, createLevelResolver } from './resolve-context.js'
import { CliServices } from './cli-services.js'
import { createTargetCompleter } from './parsers/target-completer.js'

import { CmdInit } from './commands/init-command.js'
import { CmdConnect } from './commands/connect-command.js'
import { CmdSchemaInstallation, CmdSchemaWorkspace } from './commands/schema-command.js'
import { CmdSyncInstallation, CmdSyncWorkspace } from './commands/sync-command.js'
import { CmdDaemon } from './commands/daemon-command.js'
import { CmdLsGlobal, CmdLsWorkspace } from './commands/ls-command.js'
import { CmdStatusGlobal, CmdStatusWorkspace, CmdStatusInstallation } from './commands/status-command.js'
import { Command } from './command.js'
import * as util from "node:util";

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

/** suggestAsync expects a non-empty tuple; this bridges the length guard. */
function asNonEmptyArgv(argv: readonly string[]): [string, ...string[]] {
  return (argv.length > 0 ? argv : ['']) as [string, ...string[]]
}

/** Check if argv contains a command name (positional arg not consumed by -t). */
function hasCommand(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-t' || argv[i] === '--target') { i++; continue }
    if (!argv[i].startsWith('-')) return true
  }
  return false
}

interface CommandBlock {
  level: MaxUrlLevel
  all: { [key: string]: Command }
  program: LazyOne<Parser<Mode>>
}

class GlobalCommands implements CommandBlock {
  level = 'global' as const
  constructor(private services: CliServices<'global'>) {}
  all = makeLazy({
    init: () => new CmdInit(this.services),
    daemon: () => new CmdDaemon(this.services),
    ls: () => new CmdLsGlobal(this.services),
    status: () => new CmdStatusGlobal(this.services),
  })
  program = LazyX.once(() => or(
    this.all.init.parser.get,
    this.all.daemon.parser.get,
    this.all.ls.parser.get,
    this.all.status.parser.get,
  ))
}

class WorkspaceCommands implements CommandBlock {
  level = 'workspace' as const
  constructor(private services: CliServices<'workspace'>) {}
  all = makeLazy({
    daemon: () => new CmdDaemon(this.services),
    connect: () => new CmdConnect(this.services),
    schema: () => new CmdSchemaWorkspace(this.services),
    sync: () => new CmdSyncWorkspace(this.services),
    ls: () => new CmdLsWorkspace(this.services),
    status: () => new CmdStatusWorkspace(this.services),
  })
  program = LazyX.once(() => or(
    this.all.connect.parser.get,
    this.all.schema.parser.get,
    this.all.sync.parser.get,
    this.all.daemon.parser.get,
    this.all.ls.parser.get,
    this.all.status.parser.get,
  ))
}

class InstallationCommands implements CommandBlock {
  level = 'installation' as const
  constructor(private services: CliServices<'installation'>) {}
  all = makeLazy({
    schema: () => new CmdSchemaInstallation(this.services),
    sync: () => new CmdSyncInstallation(this.services),
    status: () => new CmdStatusInstallation(this.services),
  })
  program = LazyX.once(() => or(
    this.all.schema.parser.get,
    this.all.sync.parser.get,
    this.all.status.parser.get,
  ))
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

  private encodeSuggestions(req: CliRequest, suggestions: readonly Suggestion[]): CliResponse {
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

  private async suggest(
    req: CliRequest,
    program: Parser<Mode>,
  ): Promise<CliResponse> {
    try {
      const normalized = normalizeGlobalFlag(req.argv)
      const args = asNonEmptyArgv(normalized)
      const suggestions = await suggestAsync(program, args)
      return this.encodeSuggestions(req, suggestions)
    } catch (error) {
      return { exitCode: 1, stderr: String(error), completionOutput: '' }
    }
  }

  // -- Dispatch --------------------------------------------------------------

  async execute(req: CliRequest, prompter?: Prompter): Promise<CliResponse> {
    const color = req.color ?? this.cfg.useColor ?? true
    const cwd = req.cwd ?? this.cfg.cwd
    const globalMax = await this.lazy.globalStarted

    // Normalize: -g → -t ~, bare `max` → `max status`
    let argv = normalizeGlobalFlag(req.argv)
    if (!hasCommand(argv)) {
      // Insert `status` after -t <value> (conditional expects discriminator first)
      const tIdx = argv.indexOf('-t')
      const insertAt = (tIdx >= 0 && tIdx + 1 < argv.length) ? tIdx + 2 : 0
      argv = [...argv.slice(0, insertAt), 'status', ...argv.slice(insertAt)]
    }

    // Resolve cwd as default context (always available, overridden by -t)
    const cwdCtx = detectCwdContext(cwd)
    const cwdUrl = cwdToMaxUrl(cwdCtx)
    const cwdResolved = globalMax.maxUrlResolver().resolve(cwdUrl)
    const ctxRef = { current: toContext(cwdResolved, cwdUrl) }

    // Level resolver — overrides ctxRef.current when -t is parsed
    // Delegates suggest() to target completer for -t <TAB> completions
    const completer = createTargetCompleter(globalMax, cwd)
    const levelResolver = createLevelResolver(globalMax, cwd, ctxRef, completer)

    // Lazy services — reads from ctxRef.current (always valid)
    const services = new CliServices(() => ctxRef.current as ContextAt<any>, color)

    // Command blocks
    const global       = new GlobalCommands(services)
    const workspace    = new WorkspaceCommands(services)
    const installation = new InstallationCommands(services)
    const blocks = { global, workspace, installation } as const

    // Lazy branches — parser only constructed when conditional selects that level
    const branches = {
      global:       global.program.get,
      workspace:    workspace.program.get,
      installation: installation.program.get,
    }

    // The parser — one tree, handles everything
    const program = conditional(
      option('-t', '--target', levelResolver),
      branches,
      branches[cwdCtx.level],
    )

    if (req.kind === 'complete') {
      return this.suggest(req, program)
    }

    // Parse
    const parsed = await parseAndValidateArgs(program, 'max', argv, color)
    if (!parsed.ok) return parsed.response

    const [, cmdResult] = parsed.value

    // Execute
    const cmdName = (cmdResult as { cmd: string }).cmd
    const block = blocks[ctxRef.current.level] as CommandBlock
    const command = block.all[cmdName]
    try {
      const result = await command.run(cmdResult, { color, prompter })
      return { exitCode: 0, stdout: result + '\n' }
    }catch (e){
      return { exitCode: 1, stderr: MaxError.wrap(e).prettyPrint({color})}
    }

  }
}
