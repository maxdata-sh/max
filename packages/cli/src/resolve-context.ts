/**
 * Target derivation — cwd, env, and flags → MaxUrl.
 *
 * Phase 1 of dispatch: sync, no daemon, pure filesystem + string work.
 * Phase 2 (resolver.resolve()) happens inline in execute().
 */

import { MaxUrl } from '@max/core'
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
      return { level: 'installation', workspaceName: path.basename(workspaceRoot), installationName }
    }
  }

  const workspaceRoot = findProjectRoot(cwd)
  if (workspaceRoot) {
    return { level: 'workspace', workspaceName: path.basename(workspaceRoot) }
  }

  return { level: 'global' }
}

// ============================================================================
// Target flag extraction
// ============================================================================

export interface TargetFlags {
  target: string | undefined
  global: boolean
  /** argv with -t/--target and -g/--global removed. */
  argv: string[]
}

/**
 * Extract -t/--target and -g/--global from argv.
 * Returns the cleaned argv and the extracted flag values.
 */
export function extractTargetFlags(argv: readonly string[]): TargetFlags {
  const cleaned: string[] = []
  let target: string | undefined
  let global = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ((arg === '-t' || arg === '--target') && i + 1 < argv.length) {
      target = argv[++i]
    } else if (arg === '-g' || arg === '--global') {
      global = true
    } else {
      cleaned.push(arg)
    }
  }

  return { target, global, argv: cleaned }
}

// ============================================================================
// Target derivation (Phase 1 — sync, no daemon)
// ============================================================================

export interface DerivedTarget {
  /** The MaxUrl to resolve — always present, even for bare `max` (→ max://~). */
  target: MaxUrl
  /** argv with -t/--target and -g/--global stripped out. */
  argv: string[]
}

/**
 * Derive the target MaxUrl from argv flags, env, and cwd.
 * Sync — no daemon needed. Pure filesystem + string work.
 *
 * Precedence: -t (absolute) > -g > MAX_TARGET > cwd walk > -t (relative) > MAX_TARGET (relative)
 */
export function deriveTarget(argv: readonly string[], cwd: string): DerivedTarget {
  const flags = extractTargetFlags(argv)

  // -t with absolute URL → use directly
  if (flags.target?.startsWith('max://'))
    return { target: MaxUrl.parse(flags.target), argv: flags.argv }

  // -g → global
  if (flags.global)
    return { target: MaxUrl.global(), argv: flags.argv }

  // MAX_TARGET env
  const envTarget = process.env.MAX_TARGET
  if (envTarget?.startsWith('max://'))
    return { target: MaxUrl.parse(envTarget), argv: flags.argv }
  if (envTarget === '~')
    return { target: MaxUrl.global(), argv: flags.argv }

  // Walk cwd to get base context
  const cwdCtx = detectCwdContext(cwd)
  const baseUrl =
    cwdCtx.level === 'global'       ? MaxUrl.global() :
    cwdCtx.level === 'workspace'    ? MaxUrl.forWorkspace(cwdCtx.workspaceName) :
    /* installation */                MaxUrl.forInstallation(cwdCtx.workspaceName, cwdCtx.installationName)

  // -t with relative name → child of base
  if (flags.target)
    return { target: baseUrl.child(flags.target), argv: flags.argv }

  // MAX_TARGET relative
  if (envTarget)
    return { target: baseUrl.child(envTarget), argv: flags.argv }

  // No flag → base context IS the target
  return { target: baseUrl, argv: flags.argv }
}
