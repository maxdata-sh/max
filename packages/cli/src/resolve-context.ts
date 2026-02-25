/**
 * Context resolution — cwd detection, -g normalization, and -t level resolver.
 *
 * The conditional parser handles -t natively. This module provides:
 * 1. detectCwdContext() — filesystem walk to determine default level
 * 2. normalizeGlobalFlag() — argv rewrite: -g → -t @
 * 3. cwdToMaxUrl() — convert CwdContext to a MaxUrl
 * 4. createLevelResolver() — ValueParser for -t that resolves to MaxUrlLevel
 */

import {MaxConstants, MaxUrl, MaxUrlLevel } from '@max/core'
import { findProjectRoot } from '@max/platform-bun'
import type { MaxUrlResolver } from '@max/federation'
import type { Suggestion } from '@optique/core/parser'
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser'
import { toContext, ResolvedContext } from './resolved-context.js'
import * as path from 'node:path'

// ============================================================================
// cwd detection
// ============================================================================

export type CwdContext =
  | { level: 'global' }
  | { level: 'workspace'; workspaceName: string }
  | { level: 'installation'; workspaceName: string; installationName: string }

/**
 * Detect the level implied by the current working directory.
 * Returns workspace **name** (path.basename of project root), not filesystem path.
 */
export function detectCwdContext(cwd: string): CwdContext {
  // Check if cwd is inside .max/installations/<name>/
  const installationMatch = cwd.match(/\.max\/installations\/([^/]+)/)
  if (installationMatch) {
    const installationName = installationMatch[1]
    const workspaceRoot = findProjectRoot(cwd)
    if (workspaceRoot) {
      return {
        level: 'installation',
        workspaceName: path.basename(workspaceRoot),
        installationName,
      }
    }
  }

  const workspaceRoot = findProjectRoot(cwd)
  if (workspaceRoot) {
    return { level: 'workspace', workspaceName: path.basename(workspaceRoot) }
  }

  return { level: 'global' }
}

// ============================================================================
// -g normalization
// ============================================================================

/** Rewrite -g → -t @ so optique handles both as one option. */
export function normalizeGlobalFlag(argv: readonly string[]): string[] {
  const hasTarget = argv.some((a) => a === '-t' || a === '--target')
  const result: string[] = []
  for (const arg of argv) {
    if ((arg === '-g' || arg === '--global') && !hasTarget) {
      result.push('-t', MaxConstants.GLOBAL_HOME)
    } else if (arg !== '-g' && arg !== '--global') {
      result.push(arg)
    }
  }
  return result
}

// ============================================================================
// CwdContext → MaxUrl
// ============================================================================

/** Convert a CwdContext to a MaxUrl. */
export function cwdToMaxUrl(ctx: CwdContext): MaxUrl {
  switch (ctx.level) {
    case 'global':
      return MaxUrl.global()
    case 'workspace':
      return MaxUrl.forWorkspace(ctx.workspaceName)
    case 'installation':
      return MaxUrl.forInstallation(ctx.workspaceName, ctx.installationName)
  }
}

// ============================================================================
// Level resolver for -t discriminator
// ============================================================================

/**
 * ValueParser for the -t discriminator.
 * Resolves a target string to its level. Side-effect: sets ctxRef.
 * Delegates suggest() to the target completer for -t <TAB> completions.
 */
export function createLevelResolver(
  resolver: MaxUrlResolver,
  cwd: string,
  ctxRef: { current: ResolvedContext },
  completer: { suggest?(prefix: string): AsyncIterable<Suggestion> }
): ValueParser<'async', MaxUrlLevel> {
  return {
    $mode: 'async',
    metavar: 'TARGET',

    async parse(input: string): Promise<ValueParserResult<MaxUrlLevel>> {
      const url = input.startsWith('max://')
        ? MaxUrl.parse(input)
        : input === MaxConstants.GLOBAL_HOME
          ? MaxUrl.global()
          : input
              .split('/')
              .filter(Boolean)
              .reduce((u, seg) => u.child(seg), cwdToMaxUrl(detectCwdContext(cwd)))
      const target = await resolver.resolve(url)
      ctxRef.current = toContext(target, url)
      return { success: true, value: ctxRef.current.level }
    },

    format: (v) => v,

    async *suggest(prefix: string) {
      if (completer.suggest) yield* completer.suggest(prefix)
    },
  }
}
