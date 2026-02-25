/**
 * Gate - Pre-parse target from argv before optique runs.
 *
 * peekTarget() scans argv for -t/--target, resolves the value through
 * the federation's MaxUrlResolver, and returns a ResolvedContext.
 * If no -t is present or resolution fails, falls back to cwd context.
 */

import { MaxUrl, MaxConstants } from '@max/core'
import type { MaxUrlResolver } from '@max/federation'
import { toContext, type ResolvedContext } from './resolved-context.js'
import { detectCwdContext, cwdToMaxUrl, type CwdContext } from './resolve-context.js'

export async function peekTarget(
  resolver: MaxUrlResolver,
  cwd: string,
  argv: readonly string[],
): Promise<ResolvedContext> {
  const cwdCtx = detectCwdContext(cwd)
  const targetInput = extractTargetValue(argv)

  if (!targetInput) {
    const cwdUrl = cwdToMaxUrl(cwdCtx)
    const resolved = await resolver.resolve(cwdUrl)
    return toContext(resolved, cwdUrl)
  }

  try {
    const url = parseTargetInput(targetInput, cwdCtx)
    const resolved = await resolver.resolve(url)
    return toContext(resolved, url)
  } catch {
    // Graceful fallback - bad target falls back to cwd context.
    // The optique ValueParser will surface the actual error during parsing.
    const cwdUrl = cwdToMaxUrl(cwdCtx)
    const resolved = await resolver.resolve(cwdUrl)
    return toContext(resolved, cwdUrl)
  }
}

/** Extract the value after -t/--target from argv, or undefined. */
function extractTargetValue(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '-t' || argv[i] === '--target') && i + 1 < argv.length) {
      return argv[i + 1]
    }
  }
  return undefined
}

/** Convert a -t value string into a MaxUrl. */
export function parseTargetInput(input: string, cwdCtx: CwdContext): MaxUrl {
  if (input.startsWith('max://')) return MaxUrl.parse(input)
  if (input === MaxConstants.GLOBAL_HOME) return MaxUrl.global()
  return input
    .split('/')
    .filter(Boolean)
    .reduce((u, seg) => u.child(seg), cwdToMaxUrl(cwdCtx))
}
