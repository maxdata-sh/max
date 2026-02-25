/**
 * Target value parser - async ValueParser for -t/--target.
 *
 * Lives in the optique parser tree so -t <TAB> completions and
 * -t <badvalue> validation work. The parsed value is not used for
 * routing (the gate handles that); this is purely for UX.
 *
 * Provides hierarchical completion that walks the federation tree:
 *   max -t max://@/          -> workspace names
 *   max -t max://@/my-team/  -> installation names in my-team
 *   max -t hub<TAB>          -> children of cwd context matching "hub"
 */

import type { GlobalMax } from '@max/federation'
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser'
import type { Suggestion } from '@optique/core/parser'
import { message } from '@optique/core/message'
import { detectCwdContext } from '../resolve-context.js'
import { parseTargetInput } from '../gate.js'
import { toContext, type ResolvedContext } from '../resolved-context.js'

export function createTargetValueParser(
  globalMax: GlobalMax,
  cwd: string,
): ValueParser<'async', ResolvedContext> {
  const resolver = globalMax.maxUrlResolver

  return {
    $mode: 'async',
    metavar: 'TARGET',

    async parse(input: string): Promise<ValueParserResult<ResolvedContext>> {
      try {
        const cwdCtx = detectCwdContext(cwd)
        const url = parseTargetInput(input, cwdCtx)
        const target = await resolver.resolve(url)
        return { success: true, value: toContext(target, url) }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return { success: false, error: message`${msg}` }
      }
    },

    format(value: ResolvedContext): string {
      return value.url.toString()
    },

    async *suggest(prefix: string): AsyncGenerator<Suggestion> {
      yield { kind: 'literal', text: '@', description: message`Global` }
      yield { kind: 'literal', text: 'max://', description: message`Full URL` }

      // ---- Absolute max:// URL ----

      if (prefix.startsWith('max://')) {
        const afterHost = prefix.slice('max://@/'.length)
        const segments = afterHost.split('/').filter(Boolean)

        if (segments.length === 0) {
          const workspaces = await globalMax.listWorkspaces()
          for (const ws of workspaces) {
            yield {
              kind: 'literal',
              text: `max://@/${ws.name}`,
              description: message`Workspace`,
            }
            yield {
              kind: 'literal',
              text: `max://@/${ws.name}/`,
              description: message`Workspace (installations)`,
            }
          }
        } else if (segments.length === 1) {
          const ws = globalMax.workspaceByNameOrId(segments[0])
          if (ws) {
            const installations = await ws.listInstallations()
            for (const inst of installations) {
              yield {
                kind: 'literal',
                text: `max://@/${segments[0]}/${inst.name}`,
                description: message`Installation`,
              }
            }
          }
        }
        return
      }

      // ---- Relative name - children of cwd context ----

      const cwdCtx = detectCwdContext(cwd)
      const slash = prefix.indexOf('/')

      if (slash !== -1) {
        // workspace/<TAB> — suggest installations within that workspace
        const wsName = prefix.slice(0, slash)
        const installPrefix = prefix.slice(slash + 1)
        const ws = globalMax.workspaceByNameOrId(wsName)
        if (ws) {
          const installations = await ws.listInstallations()
          for (const inst of installations) {
            if (inst.name.startsWith(installPrefix)) {
              yield { kind: 'literal', text: `${wsName}/${inst.name}`, description: message`Installation` }
            }
          }
        }
      } else if (cwdCtx.level === 'global') {
        const workspaces = await globalMax.listWorkspaces()
        for (const ws of workspaces) {
          if (ws.name.startsWith(prefix)) {
            yield { kind: 'literal', text: ws.name, description: message`Workspace` }
            yield { kind: 'literal', text: `${ws.name}/`, description: message`Workspace (installations)` }
          }
        }
      } else if (cwdCtx.level === 'workspace') {
        const ws = globalMax.workspaceByNameOrId(cwdCtx.workspaceName)
        if (ws) {
          const installations = await ws.listInstallations()
          for (const inst of installations) {
            if (inst.name.startsWith(prefix)) {
              yield { kind: 'literal', text: inst.name, description: message`Installation` }
            }
          }
        }
      }
    },
  }
}
