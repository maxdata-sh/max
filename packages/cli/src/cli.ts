/**
 * CLI - The dispatch engine.
 *
 * Uses a two-phase gate pattern: peekTarget() resolves the target level
 * from -t before optique runs, then buildParser() constructs a parser
 * with only the commands available at that level.
 *
 * The harness (process argv parsing, daemon mode, socket server) lives
 * in main.ts. This file is pure logic, no process-level side effects.
 */

import { GlobalMax } from '@max/federation'
import { BunPlatform, GlobalConfig } from '@max/platform-bun'

import * as Completion from '@optique/core/completion'
import { ShellCompletion } from '@optique/core/completion'
import { or, object } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { optional } from '@optique/core/modifiers'
import { Mode, Parser, suggestAsync, type Suggestion } from '@optique/core/parser'

import { makeLazy, MaxError } from '@max/core'
import { CliRequest, CliResponse } from './types.js'
import { parseAndValidateArgs } from './argv-parser.js'
import { type Prompter } from './prompter.js'
import { type ContextAt, type ResolvedContext } from './resolved-context.js'
import { normalizeGlobalFlag } from './resolve-context.js'
import { peekTarget } from './gate.js'
import { CliServices } from './cli-services.js'
import { createTargetValueParser } from './parsers/target-value-parser.js'

import { CmdInit } from './commands/init-command.js'
import { CmdConnect } from './commands/connect-command.js'
import { CmdSchemaInstallation, CmdSchemaWorkspace } from './commands/schema-command.js'
import { CmdSyncInstallation, CmdSyncWorkspace } from './commands/sync-command/sync-command.js'
import { CmdDaemon } from './commands/daemon-command.js'
import { CmdLsGlobal, CmdLsWorkspace } from './commands/ls-command.js'
import { CmdStatusGlobal, CmdStatusWorkspace, CmdStatusInstallation } from './commands/status-command.js'
import { CmdSearchInstallation } from './commands/search-command.js'
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
// Helpers
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

// ============================================================================
// CLI
// ============================================================================

export interface CliOptions {
  /** Pre-built GlobalMax - skips creation and start. Used for testing. */
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
      // There's a bug in the encoder that fails to treat max:// urls as atomic. Escaping the :// parts is necessary:
      const preEncoded = suggestions.map(preEncodeSuggestion)
      for (const chunk of shell.encodeSuggestions(preEncoded)) {
        chunks.push(chunk)
      }
      return { exitCode: 0, completionOutput: chunks.join('\n') }
    }else{
      const completions = suggestions.filter((s) => s.kind === 'literal').map((s) => s.text)
      return { exitCode: 0, completions }
    }

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

  // -- Parser builder --------------------------------------------------------

  private buildParser(
    ctx: ResolvedContext,
    globalMax: GlobalMax,
    cwd: string,
    color: boolean,
  ): { program: Parser<Mode>; commands: Record<string, Command> } {
    const targetVP = createTargetValueParser(globalMax, cwd)
    const services = new CliServices(ctx as ContextAt<any>, color)

    const buildProgram = (commandParser: Parser<Mode>) =>
      object({ target: optional(option('-t', '--target', targetVP)), command: commandParser })

    switch (ctx.level) {
      case 'global': {
        const cmds = {
          init: new CmdInit(services),
          daemon: new CmdDaemon(services),
          ls: new CmdLsGlobal(services),
          status: new CmdStatusGlobal(services),
        }
        return {
          commands: cmds,
          program: buildProgram(or(
            cmds.init.parser.get,
            cmds.daemon.parser.get,
            cmds.ls.parser.get,
            cmds.status.parser.get,
          )),
        }
      }
      case 'workspace': {
        const cmds = {
          daemon: new CmdDaemon(services),
          connect: new CmdConnect(services),
          schema: new CmdSchemaWorkspace(services),
          sync: new CmdSyncWorkspace(services),
          ls: new CmdLsWorkspace(services),
          status: new CmdStatusWorkspace(services),
        }
        return {
          commands: cmds,
          program: buildProgram(or(
            cmds.connect.parser.get,
            cmds.schema.parser.get,
            cmds.sync.parser.get,
            cmds.daemon.parser.get,
            cmds.ls.parser.get,
            cmds.status.parser.get,
          )),
        }
      }
      case 'installation': {
        const cmds = {
          schema: new CmdSchemaInstallation(services),
          sync: new CmdSyncInstallation(services),
          search: new CmdSearchInstallation(services),
          status: new CmdStatusInstallation(services),
        }
        return {
          commands: cmds,
          program: buildProgram(or(
            cmds.schema.parser.get,
            cmds.sync.parser.get,
            cmds.search.parser.get,
            cmds.status.parser.get,
          )),
        }
      }
    }
  }

  // -- Dispatch --------------------------------------------------------------

  async execute(req: CliRequest, prompter?: Prompter): Promise<CliResponse> {
    const color = req.color ?? this.cfg.useColor ?? true
    const cwd = req.cwd ?? this.cfg.cwd
    const globalMax = await this.lazy.globalStarted

    // Normalize: -g -> -t @, bare `max` -> `max status`
    let argv = normalizeGlobalFlag(req.argv)
    if (!hasCommand(argv)) {
      const tIdx = argv.indexOf('-t')
      const insertAt = (tIdx >= 0 && tIdx + 1 < argv.length) ? tIdx + 2 : 0
      argv = [...argv.slice(0, insertAt), 'status', ...argv.slice(insertAt)]
    }

    // Resolve target (global/workspace/installation) before parser runs
    const ctx = await peekTarget(globalMax.maxUrlResolver, cwd, argv)

    // Build parser for this target level
    const { program, commands } = this.buildParser(ctx, globalMax, cwd, color)

    if (req.kind === 'complete') {
      return this.suggest(req, program)
    }

    // Parse
    const parsed = await parseAndValidateArgs(program, 'max', argv, color)
    if (!parsed.ok) return parsed.response

    const { command: cmdResult } = parsed.value as { command: { cmd: string } }

    // Execute
    const command = commands[cmdResult.cmd]
    try {
      const result = await command.run(cmdResult, { color, prompter })
      return { exitCode: 0, stdout: result + '\n' }
    } catch (e) {
      return { exitCode: 1, stderr: MaxError.wrap(e).prettyPrint({ color }) }
    }
  }
}

const slashEscape = (str:string) => str.replaceAll(/[:/]/g, c => `\\${c}`)
const preEncodeSuggestion = (suggestion: Suggestion):Suggestion => suggestion.kind === 'literal'
  ? {...suggestion, text: slashEscape(suggestion.text)}
  : suggestion
