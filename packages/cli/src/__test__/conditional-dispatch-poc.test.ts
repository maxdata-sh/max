/**
 * POC: Prove that optique's `conditional` combinator can naturally select
 * the right command program based on `-t <target>` resolution.
 *
 * Architecture:
 *   conditional(
 *     option('-t', '--target', levelResolver),
 *     { global: globalProgram, workspace: workspaceProgram, installation: installationProgram },
 *     cwdDefaultProgram
 *   )
 *
 * - The discriminator is `-t` with a custom ValueParser that resolves a target
 *   string to 'global' | 'workspace' | 'installation'.
 * - Each branch is a command `or()` tree for that level.
 * - The default branch (no `-t`) is the cwd-inferred program.
 * - `-g` is normalized to `-t ~` before parsing (not a pre-parse — just argv rewriting).
 */

import { test, expect, describe } from 'bun:test'
import { conditional, object, or } from '@optique/core/constructs'
import { command, constant, option, argument } from '@optique/core/primitives'
import { parse, parseSync, type InferValue } from '@optique/core/parser'
import { string } from '@optique/core/valueparser'
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser'

// ============================================================================
// 1. Target-level resolver (simulates MaxUrlResolver)
// ============================================================================

type Level = 'global' | 'workspace' | 'installation'

/**
 * A sync ValueParser that takes a target string and returns the level.
 * In real code this would call globalMax.maxUrlResolver().resolve(url).level.
 */
function createLevelResolver(
  knownTargets: Record<string, Level>,
): ValueParser<'sync', Level> {
  return {
    $mode: 'sync',
    metavar: 'TARGET',

    parse(input: string): ValueParserResult<Level> {
      const level = knownTargets[input]
      if (!level) return { success: false, error: `Unknown target: ${input}` }
      return { success: true, value: level }
    },

    format(value: Level): string {
      return value
    },
  }
}

// ============================================================================
// 2. Per-level command programs
// ============================================================================

const globalProgram = or(
  command('ls', object({ cmd: constant('ls') })),
  command('status', object({ cmd: constant('status') })),
  command('init', object({ cmd: constant('init') })),
)

const workspaceProgram = or(
  command('ls', object({ cmd: constant('ls') })),
  command('status', object({ cmd: constant('status') })),
  command(
    'sync',
    object({ cmd: constant('sync'), name: argument(string()) }),
  ),
  command(
    'connect',
    object({ cmd: constant('connect'), source: argument(string()) }),
  ),
)

const installationProgram = or(
  command('status', object({ cmd: constant('status') })),
  command('sync', object({ cmd: constant('sync') })),
)

// ============================================================================
// 3. Conditional dispatch — the whole parser
// ============================================================================

const resolver = createLevelResolver({
  '~': 'global',
  'my-team': 'workspace',
  'max://~/my-team': 'workspace',
  'hubspot-prod': 'installation',
  'max://~/my-team/hubspot-prod': 'installation',
})

const program = conditional(
  option('-t', '--target', resolver),
  {
    global: globalProgram,
    workspace: workspaceProgram,
    installation: installationProgram,
  },
  // Default branch: when no -t is provided, use workspace (simulating cwd in a workspace dir)
  workspaceProgram,
)

// ============================================================================
// 4. -g normalization (trivial argv rewriting, not a pre-parse)
// ============================================================================

function normalizeGlobalFlag(argv: readonly string[]): string[] {
  const result: string[] = []
  let hasTarget = false
  for (const arg of argv) {
    if (arg === '-t' || arg === '--target') hasTarget = true
  }
  for (const arg of argv) {
    if ((arg === '-g' || arg === '--global') && !hasTarget) {
      result.push('-t', '~')
    } else if (arg !== '-g' && arg !== '--global') {
      result.push(arg)
    }
    // If hasTarget, silently drop -g (spec says -t wins)
  }
  return result
}

// ============================================================================
// Tests
// ============================================================================

type ProgramResult = InferValue<typeof program>

function parsed(argv: string[]): ProgramResult {
  const normalized = normalizeGlobalFlag(argv)
  const result = parseSync(program, normalized)
  if (!result.success) throw new Error(`Parse failed: ${result.error}`)
  return result.value
}

describe('conditional dispatch POC', () => {
  // ---- -t targeting ----

  test('-t ~ routes to global program', () => {
    const [level, cmd] = parsed(['-t', '~', 'ls'])
    expect(level).toBe('global')
    expect(cmd).toEqual({ cmd: 'ls' })
  })

  test('-t workspace routes to workspace program', () => {
    const [level, cmd] = parsed(['-t', 'my-team', 'sync', 'hubspot'])
    expect(level).toBe('workspace')
    expect(cmd).toEqual({ cmd: 'sync', name: 'hubspot' })
  })

  test('-t installation routes to installation program', () => {
    const [level, cmd] = parsed(['-t', 'hubspot-prod', 'status'])
    expect(level).toBe('installation')
    expect(cmd).toEqual({ cmd: 'status' })
  })

  test('-t absolute URL works', () => {
    const [level, cmd] = parsed(['-t', 'max://~/my-team/hubspot-prod', 'sync'])
    expect(level).toBe('installation')
    expect(cmd).toEqual({ cmd: 'sync' })
  })

  // ---- -g flag ----

  test('-g routes to global program', () => {
    const [level, cmd] = parsed(['-g', 'ls'])
    expect(level).toBe('global')
    expect(cmd).toEqual({ cmd: 'ls' })
  })

  test('-g status works', () => {
    const [level, cmd] = parsed(['-g', 'status'])
    expect(level).toBe('global')
    expect(cmd).toEqual({ cmd: 'status' })
  })

  // ---- -t wins over -g ----

  test('-t wins over -g', () => {
    const [level, cmd] = parsed(['-g', '-t', 'my-team', 'sync', 'hubspot'])
    expect(level).toBe('workspace')
    expect(cmd).toEqual({ cmd: 'sync', name: 'hubspot' })
  })

  // ---- Default branch (no -t, no -g) ----

  test('no flag uses default branch (workspace from cwd)', () => {
    const [level, cmd] = parsed(['sync', 'linear'])
    expect(level).toBeUndefined() // default branch → discriminator is undefined
    expect(cmd).toEqual({ cmd: 'sync', name: 'linear' })
  })

  test('no flag: connect works (workspace command)', () => {
    const [level, cmd] = parsed(['connect', 'hubspot'])
    expect(level).toBeUndefined()
    expect(cmd).toEqual({ cmd: 'connect', source: 'hubspot' })
  })

  // ---- Level gating is natural ----

  test('installation-only command fails at global level', () => {
    // `sync` at installation level takes no args, but at global level it doesn't exist
    const result = parseSync(program, ['-t', '~', 'sync'])
    expect(result.success).toBe(false)
  })

  test('global-only command fails at installation level', () => {
    // `init` only exists in global program
    const result = parseSync(program, ['-t', 'hubspot-prod', 'init'])
    expect(result.success).toBe(false)
  })

  // ---- Bad target ----

  test('unknown target fails', () => {
    const result = parseSync(program, ['-t', 'nonexistent', 'ls'])
    expect(result.success).toBe(false)
  })

  // ---- Flag position ----

  test('-t must come before command (conditional processes discriminator first)', () => {
    // conditional parses the discriminator then delegates remaining argv to the branch.
    // If -t appears after the command, the discriminator misses it and falls through
    // to the default branch, which then sees `-t` as unexpected.
    const result = parseSync(program, ['ls', '-t', '~'])
    expect(result.success).toBe(false)
  })

  test('-t before command works', () => {
    const [level, cmd] = parsed(['-t', '~', 'ls'])
    expect(level).toBe('global')
    expect(cmd).toEqual({ cmd: 'ls' })
  })
})
