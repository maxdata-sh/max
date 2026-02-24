/**
 * Target completer — async ValueParser for -t/--target values.
 *
 * Provides hierarchical completion that walks the federation tree:
 *   max -t max://~/          → workspace names
 *   max -t max://~/my-team/  → installation names in my-team
 *   max -t hub<TAB>          → children of cwd context matching "hub"
 */

import type { GlobalMax } from '@max/federation'
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser'
import type { Suggestion } from '@optique/core/parser'
import { message } from '@optique/core/message'
import { detectCwdContext } from '../resolve-context.js'

export function createTargetCompleter(
  globalMax: GlobalMax,
  cwd: string,
): ValueParser<'async', string> {
  return {
    $mode: 'async',
    metavar: 'TARGET',

    async parse(input: string): Promise<ValueParserResult<string>> {
      // Accept any string — actual resolution happens in the dispatch pipeline
      return { success: true, value: input }
    },

    format(value: string): string {
      return value
    },

    async *suggest(prefix: string): AsyncGenerator<Suggestion> {
      yield { kind: 'literal', text: '~', description: message`Global` }

      // ---- Absolute max:// URL ----

      if (prefix.startsWith('max://')) {
        const afterHost = prefix.slice('max://~/'.length)
        const segments = afterHost.split('/').filter(Boolean)

        if (segments.length === 0) {
          // max://~ or max://~/ → suggest workspaces
          const workspaces = await globalMax.listWorkspaces()
          for (const ws of workspaces) {
            yield {
              kind: 'literal',
              text: `max://~/${ws.name}`,
              description: message`Workspace`,
            }
          }
        } else if (segments.length === 1) {
          // max://~/workspace/ → suggest installations
          const ws = globalMax.workspaceByNameOrId(segments[0])
          if (ws) {
            const installations = await ws.client.listInstallations()
            for (const inst of installations) {
              yield {
                kind: 'literal',
                text: `max://~/${segments[0]}/${inst.name}`,
                description: message`Installation`,
              }
            }
          }
        }
        return
      }

      // ---- Relative name — children of cwd context ----

      const cwdCtx = detectCwdContext(cwd)

      if (cwdCtx.level === 'global') {
        const workspaces = await globalMax.listWorkspaces()
        for (const ws of workspaces) {
          yield { kind: 'literal', text: ws.name, description: message`Workspace` }
        }
      } else if (cwdCtx.level === 'workspace') {
        const ws = globalMax.workspaceByNameOrId(cwdCtx.workspaceName)
        if (ws) {
          const installations = await ws.client.listInstallations()
          for (const inst of installations) {
            yield { kind: 'literal', text: inst.name, description: message`Installation` }
          }
        }
      }
    },
  }
}
