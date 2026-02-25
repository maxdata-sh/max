/**
 * Context resolution - cwd detection, -g normalization, and cwd-to-MaxUrl.
 *
 * 1. detectCwdContext() - filesystem walk to determine default level
 * 2. normalizeGlobalFlag() - argv rewrite: -g -> -t @
 * 3. cwdToMaxUrl() - convert CwdContext to a MaxUrl
 */

import { MaxConstants, MaxUrl } from '@max/core'
import { findProjectRoot } from '@max/platform-bun'
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

