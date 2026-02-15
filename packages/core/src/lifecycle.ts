/**
 * Lifecycle — Lightweight start/stop protocol for services.
 *
 * Services implement Lifecycle with LifecycleManager helpers:
 *   - start: run-once guard (idempotent)
 *   - stop: always runs
 *   - none: no-op placeholder
 *   - auto: declarative dependency ordering (start forward, stop reverse)
 */

// ============================================================================
// Lifecycle Interface
// ============================================================================

export interface Lifecycle {
  start: LifecycleStep
  stop: LifecycleStep
}

export interface LifecycleStep {
  (): void | Promise<void>
}

// ============================================================================
// LifecycleManager
// ============================================================================

/** Entry in an auto() sequence: a single Lifecycle or a parallel group. */
type AutoEntry = Lifecycle | Lifecycle[]

export const LifecycleManager = {
  /** No-op step — for services that don't need start or stop. */
  none(): LifecycleStep {
    return () => {}
  },

  /** Run-once start step. Subsequent calls are no-ops. */
  start(fn: () => void | Promise<void>): LifecycleStep {
    let started = false
    return async () => {
      if (!started) {
        started = true
        await fn()
      }
    }
  },

  /** Stop step. Runs every time it's called. */
  stop(fn: () => void | Promise<void>): LifecycleStep {
    return async () => {
      await fn()
    }
  },

  /**
   * Derive start/stop from a dependency list.
   *
   * Start walks the list forward. Stop walks it in reverse.
   * Array entries run in parallel; single entries run sequentially.
   */
  auto(deps: AutoEntry[]): Lifecycle {
    const start = LifecycleManager.start(async () => {
      for (const entry of deps) {
        if (Array.isArray(entry)) {
          await Promise.all(entry.map((d) => d.start()))
        } else {
          await entry.start()
        }
      }
    })

    const stop = LifecycleManager.stop(async () => {
      for (let i = deps.length - 1; i >= 0; i--) {
        const entry = deps[i]
        if (Array.isArray(entry)) {
          await Promise.all(entry.map((d) => d.stop()))
        } else {
          await entry.stop()
        }
      }
    })

    return { start, stop }
  },
}
