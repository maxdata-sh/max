/**
 * Lifecycle — Lightweight start/stop protocol for services.
 *
 * Services implement Lifecycle by providing a `lifecycle` field:
 *   - LifecycleManager.on({ start?, stop? }) — manual start/stop
 *   - LifecycleManager.auto(deps) — derived from dependency ordering
 */

// ============================================================================
// Lifecycle Interface
// ============================================================================

export interface Lifecycle {
  lifecycle: LifecycleMethods
}

export interface LifecycleMethods {
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
  /** Manual lifecycle with explicit start/stop. Omitted methods default to no-ops. */
  on(opts: { start?: () => void | Promise<void>; stop?: () => void | Promise<void> }): LifecycleMethods {
    return {
      start: LifecycleManager.start(opts.start ?? (() => {})),
      stop: LifecycleManager.stop(opts.stop ?? (() => {})),
    }
  },

  /** No-op step. */
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
   * Derive lifecycle from a dependency list.
   *
   * Start walks the list forward. Stop walks it in reverse.
   * Array entries run in parallel; single entries run sequentially.
   * Accepts a thunk to allow referencing `this` in class field initializers.
   */
  auto(deps: AutoEntry[] | (() => AutoEntry[])): LifecycleMethods {
    const resolve = () => typeof deps === "function" ? deps() : deps

    const start = LifecycleManager.start(async () => {
      for (const entry of resolve()) {
        if (Array.isArray(entry)) {
          await Promise.all(entry.map((d) => d.lifecycle.start()))
        } else {
          await entry.lifecycle.start()
        }
      }
    })

    const stop = LifecycleManager.stop(async () => {
      const resolved = resolve()
      for (let i = resolved.length - 1; i >= 0; i--) {
        const entry = resolved[i]
        if (Array.isArray(entry)) {
          await Promise.all(entry.map((d) => d.lifecycle.stop()))
        } else {
          await entry.lifecycle.stop()
        }
      }
    })

    return { start, stop }
  },
}
