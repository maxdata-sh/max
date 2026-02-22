/**
 * ResolverGraph — Declarative dependency resolution with cascading and memoization.
 *
 * Define a graph of named resolvers where each can depend on others via property
 * access on the resolved context. Dependencies cascade automatically — override
 * one node and everything downstream re-resolves through it.
 *
 * All resolution is synchronous. Async operations (e.g., dynamic imports) should
 * happen outside the graph and feed results in via config or overrides.
 *
 * @example
 *   const graph = ResolverGraph.define<Config, Deps>({
 *     dbPath:    (config)    => join(config.dataDir, "data.db"),
 *     engine:    (config, r) => openEngine(r.dbPath),
 *     taskStore: (config, r) => new TaskStore(r.engine.db),
 *   })
 *
 *   const deps = graph.resolve(config)
 *   deps.taskStore  // lazily resolves engine, then dbPath, then taskStore
 *
 *   const test = graph.with({ engine: () => memoryEngine() })
 *   test.resolve(config).taskStore  // uses memory engine
 */

import { MaxError } from './max-error.js'
import { ErrCircularDependency, ErrResolutionFailed } from './errors/errors.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single resolver factory: receives raw config and the resolved context (memoized proxy). */
type ResolverFactory<TConfig, TShape, K extends keyof TShape> = (
  config: TConfig,
  resolved: TShape,
) => TShape[K]

/** Record of resolver factories — one per output key. */
export type ResolverFactories<TConfig, TShape> = {
  [K in keyof TShape]: ResolverFactory<TConfig, TShape, K>
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ResolverGraph<TConfig, TShape> {
  /**
   * Resolve config into a lazily-evaluated, memoized shape.
   *
   * Properties resolve on first access. Accessing `result.taskStore` triggers
   * taskStore's factory, which may access `resolved.engine`, triggering engine's
   * factory, and so on. Each factory runs at most once per `resolve()` call.
   */
  resolve(config: TConfig): TShape

  /**
   * Create a new graph with some factories replaced.
   *
   * Downstream dependents cascade automatically through the overridden node.
   * The original graph is not modified.
   */
  with(overrides: Partial<ResolverFactories<TConfig, TShape>>): ResolverGraph<TConfig, TShape>
}

// ---------------------------------------------------------------------------
// Companion
// ---------------------------------------------------------------------------

export const ResolverGraph = {
  /**
   * Define a resolver graph.
   *
   * Each factory receives `(config, resolved)` where `resolved` is a memoized
   * proxy. Accessing `resolved.someKey` lazily triggers that key's factory —
   * cascading is implicit via property access.
   */
  define<TConfig, TShape>(
    factories: ResolverFactories<TConfig, TShape>,
  ): ResolverGraph<TConfig, TShape> {
    return createGraph(factories)
  },
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build a lazily-resolved object using Object.defineProperty getters.
 *
 * Each key becomes a getter that, on first access, calls its factory (passing
 * config + the resolved object itself for cascading), caches the result, and
 * returns it. The getter stays in place — subsequent accesses hit the cache.
 *
 * No Proxy needed: the resolved object IS a plain object with lazy getters
 * whose keys exactly match TShape.
 */
function createGraph<TConfig, TShape>(
  factories: ResolverFactories<TConfig, TShape>,
): ResolverGraph<TConfig, TShape> {
  const factoryKeys = Object.keys(factories)

  return {
    resolve(config: TConfig): TShape {
      const cache = new Map<string, unknown>()
      const resolving = new Set<string>()

      // Shared resolution logic — called by each property getter.
      function resolveKey(key: string): unknown {
        if (cache.has(key)) return cache.get(key)

        if (resolving.has(key)) {
          throw ErrCircularDependency.create({ chain: [...resolving, key] })
        }

        if (!(key in factories)) return undefined

        resolving.add(key)
        try {
          // Dynamic dispatch by string key. TypeScript can't narrow a runtime
          // string to a specific literal of keyof TShape, so the index uses a
          // bounded cast (string → keyof TShape & string). The factory's
          // signature is correct for whichever key we're resolving at runtime.
          const factory = factories[key as keyof TShape & string]
          const value = factory(config, resolved as TShape)
          cache.set(key, value)
          return value
        } catch (e) {
          // Let inner resolver errors propagate without double-wrapping
          if (MaxError.isMaxError(e)) throw e
          throw ErrResolutionFailed.create({ key }, e instanceof Error ? e.message : String(e))
        } finally {
          resolving.delete(key)
        }
      }

      // Build an object with lazy, self-caching getters for each factory key.
      // TypeScript can't verify shapes built via defineProperty, so the final
      // assertion to TShape is structural — the factory keys guarantee coverage.
      const resolved: Record<string, unknown> = Object.create(null)
      for (const key of factoryKeys) {
        Object.defineProperty(resolved, key, {
          configurable: true,
          enumerable: true,
          get: () => resolveKey(key),
        })
      }

      return resolved as TShape
    },

    with(overrides) {
      const merged: ResolverFactories<TConfig, TShape> = Object.assign(
        {},
        factories,
        overrides,
      )
      return createGraph(merged)
    },
  }
}
