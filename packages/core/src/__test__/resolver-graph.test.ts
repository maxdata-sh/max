import { describe, test, expect } from 'bun:test'
import { ResolverGraph } from '../resolver-graph.js'
import { MaxError } from '../max-error.js'
import { ErrCircularDependency, ErrResolutionFailed } from '../errors/errors.js'

// ---------------------------------------------------------------------------
// Test domain: mimics deployment resolution without real implementations
// ---------------------------------------------------------------------------

interface DeploymentConfig {
  dataDir: string
  engineType?: 'sqlite' | 'memory'
}

interface FakeEngine {
  type: string
  path: string
  db: { name: string }
}

interface FakeStore {
  type: string
  db: { name: string }
}

interface DeploymentDeps {
  dbPath: string
  credentialStorePath: string
  engine: FakeEngine
  taskStore: FakeStore
  syncMeta: FakeStore
}

const DeploymentResolver = ResolverGraph.define<DeploymentConfig, DeploymentDeps>({
  dbPath: (config) =>
    config.engineType === 'memory' ? ':memory:' : `${config.dataDir}/data.db`,

  credentialStorePath: (config) => `${config.dataDir}/credentials.json`,

  engine: (config, r) => ({
    type: config.engineType ?? 'sqlite',
    path: r.dbPath,
    db: { name: `db-at-${r.dbPath}` },
  }),

  taskStore: (_config, r) => ({
    type: 'task-store',
    db: r.engine.db, // cascades through engine
  }),

  syncMeta: (_config, r) => ({
    type: 'sync-meta',
    db: r.engine.db, // cascades through engine
  }),
})

// ---------------------------------------------------------------------------
// Helper: count how many times a function is called
// ---------------------------------------------------------------------------

function counted<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): ((...args: TArgs) => TReturn) & { calls: number } {
  const wrapper = (...args: TArgs): TReturn => {
    wrapper.calls++
    return fn(...args)
  }
  wrapper.calls = 0
  return wrapper
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResolverGraph', () => {
  describe('basic resolution', () => {
    test('resolves a leaf value from config', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      expect(deps.dbPath).toBe('/tmp/test/data.db')
    })

    test('resolves independent values from config', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      expect(deps.credentialStorePath).toBe('/tmp/test/credentials.json')
    })

    test('resolves cascading dependencies (engine depends on dbPath)', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      expect(deps.engine.path).toBe('/tmp/test/data.db')
      expect(deps.engine.db.name).toBe('db-at-/tmp/test/data.db')
    })

    test('resolves deep cascading (taskStore → engine → dbPath)', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      expect(deps.taskStore.db.name).toBe('db-at-/tmp/test/data.db')
      expect(deps.syncMeta.db.name).toBe('db-at-/tmp/test/data.db')
    })

    test('config values flow through the entire cascade', () => {
      const deps = DeploymentResolver.resolve({
        dataDir: '/tmp/test',
        engineType: 'memory',
      })
      expect(deps.dbPath).toBe(':memory:')
      expect(deps.engine.path).toBe(':memory:')
      expect(deps.engine.type).toBe('memory')
      expect(deps.taskStore.db.name).toBe('db-at-:memory:')
    })
  })

  describe('memoization', () => {
    test('same property returns same reference', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      const engine1 = deps.engine
      const engine2 = deps.engine
      expect(engine1).toBe(engine2)
    })

    test('shared dependency (engine) is constructed once even when accessed by multiple dependents', () => {
      const engineFactory = counted(
        (config: DeploymentConfig, r: DeploymentDeps): FakeEngine => ({
          type: config.engineType ?? 'sqlite',
          path: r.dbPath,
          db: { name: `db-at-${r.dbPath}` },
        }),
      )

      const graph = ResolverGraph.define<DeploymentConfig, DeploymentDeps>({
        dbPath: (config) => `${config.dataDir}/data.db`,
        credentialStorePath: (config) => `${config.dataDir}/credentials.json`,
        engine: engineFactory,
        taskStore: (_config, r) => ({ type: 'task-store', db: r.engine.db }),
        syncMeta: (_config, r) => ({ type: 'sync-meta', db: r.engine.db }),
      })

      const deps = graph.resolve({ dataDir: '/tmp/test' })
      deps.taskStore // triggers engine
      deps.syncMeta // engine already cached
      expect(engineFactory.calls).toBe(1)
    })

    test('taskStore and syncMeta share the same engine.db reference', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      expect(deps.taskStore.db).toBe(deps.syncMeta.db)
      expect(deps.taskStore.db).toBe(deps.engine.db)
    })
  })

  describe('laziness', () => {
    test('accessing one property does not trigger unrelated resolvers', () => {
      const engineFactory = counted(
        (_config: DeploymentConfig, r: DeploymentDeps): FakeEngine => ({
          type: 'sqlite',
          path: r.dbPath,
          db: { name: 'db' },
        }),
      )

      const graph = ResolverGraph.define<DeploymentConfig, DeploymentDeps>({
        dbPath: (config) => `${config.dataDir}/data.db`,
        credentialStorePath: (config) => `${config.dataDir}/credentials.json`,
        engine: engineFactory,
        taskStore: (_config, r) => ({ type: 'task-store', db: r.engine.db }),
        syncMeta: (_config, r) => ({ type: 'sync-meta', db: r.engine.db }),
      })

      const deps = graph.resolve({ dataDir: '/tmp/test' })
      deps.credentialStorePath // only access this — unrelated to engine
      expect(engineFactory.calls).toBe(0)
    })
  })

  describe('with() overrides', () => {
    test('replaces a resolver', () => {
      const custom = DeploymentResolver.with({
        engine: () => ({
          type: 'custom',
          path: ':memory:',
          db: { name: 'custom-db' },
        }),
      })

      const deps = custom.resolve({ dataDir: '/tmp/test' })
      expect(deps.engine.type).toBe('custom')
      expect(deps.engine.path).toBe(':memory:')
    })

    test('downstream dependents cascade through overridden resolver', () => {
      const custom = DeploymentResolver.with({
        engine: () => ({
          type: 'memory',
          path: ':memory:',
          db: { name: 'in-memory-db' },
        }),
      })

      const deps = custom.resolve({ dataDir: '/tmp/test' })
      expect(deps.taskStore.db.name).toBe('in-memory-db')
      expect(deps.syncMeta.db.name).toBe('in-memory-db')
    })

    test('does not affect the original graph', () => {
      const custom = DeploymentResolver.with({
        dbPath: () => '/overridden/path.db',
      })

      const original = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      const overridden = custom.resolve({ dataDir: '/tmp/test' })

      expect(original.dbPath).toBe('/tmp/test/data.db')
      expect(overridden.dbPath).toBe('/overridden/path.db')
    })

    test('cascades through multiple levels (dbPath → engine → taskStore)', () => {
      const custom = DeploymentResolver.with({
        dbPath: () => '/custom/database.db',
      })

      const deps = custom.resolve({ dataDir: '/tmp/test' })
      expect(deps.dbPath).toBe('/custom/database.db')
      expect(deps.engine.path).toBe('/custom/database.db')
      expect(deps.taskStore.db.name).toBe('db-at-/custom/database.db')
    })
  })

  describe('error handling', () => {
    test('circular dependency throws ErrCircularDependency', () => {
      interface Circular {
        a: string
        b: string
      }
      const graph = ResolverGraph.define<object, Circular>({
        a: (_, r) => r.b,
        b: (_, r) => r.a,
      })

      expect(() => graph.resolve({}).a).toThrow()
      try {
        graph.resolve({}).a
      } catch (e) {
        expect(MaxError.isMaxError(e)).toBe(true)
        expect(ErrCircularDependency.is(e)).toBe(true)
      }
    })

    test('circular dependency chain includes all participants', () => {
      interface Circular {
        a: string
        b: string
        c: string
      }
      const graph = ResolverGraph.define<object, Circular>({
        a: (_, r) => r.b,
        b: (_, r) => r.c,
        c: (_, r) => r.a,
      })

      try {
        graph.resolve({}).a
        expect.unreachable('should have thrown')
      } catch (e) {
        if (!ErrCircularDependency.is(e)) throw e
        expect(e.data.chain).toEqual(['a', 'b', 'c', 'a'])
      }
    })

    test('factory error is wrapped in ErrResolutionFailed', () => {
      interface Broken {
        value: string
      }
      const graph = ResolverGraph.define<object, Broken>({
        value: () => {
          throw new TypeError('boom')
        },
      })

      try {
        graph.resolve({}).value
        expect.unreachable('should have thrown')
      } catch (e) {
        if (!ErrResolutionFailed.is(e)) throw e
        expect(e.data.key).toBe('value')
      }
    })

    test('inner resolver error propagates without double-wrapping', () => {
      interface Chain {
        inner: string
        outer: string
      }
      const graph = ResolverGraph.define<object, Chain>({
        inner: () => {
          throw new TypeError('root cause')
        },
        outer: (_, r) => r.inner,
      })

      try {
        graph.resolve({}).outer
        expect.unreachable('should have thrown')
      } catch (e) {
        // Should be ErrResolutionFailed for 'inner', not double-wrapped for 'outer'
        if (!ErrResolutionFailed.is(e)) throw e
        expect(e.data.key).toBe('inner')
      }
    })

    test('unknown keys return undefined', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp' })
      expect((deps as any)['nonexistent']).toBeUndefined()
    })
  })

  describe('object protocol', () => {
    test('spreading resolves all properties', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      const spread = { ...deps }

      expect(spread.dbPath).toBe('/tmp/test/data.db')
      expect(spread.engine.path).toBe('/tmp/test/data.db')
      expect(spread.taskStore.db).toBe(spread.engine.db)
    })

    test('"in" operator works for known keys', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      expect('dbPath' in deps).toBe(true)
      expect('engine' in deps).toBe(true)
    })

    test('"in" operator returns false for unknown keys', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      expect('nonexistent' in deps).toBe(false)
    })

    test('Object.keys returns all resolver keys', () => {
      const deps = DeploymentResolver.resolve({ dataDir: '/tmp/test' })
      const keys = Object.keys(deps)
      expect(keys).toContain('dbPath')
      expect(keys).toContain('engine')
      expect(keys).toContain('taskStore')
      expect(keys).toContain('syncMeta')
      expect(keys).toContain('credentialStorePath')
      expect(keys.length).toBe(5)
    })
  })

  describe('separate resolve calls are independent', () => {
    test('two resolve calls do not share memoization', () => {
      const engineFactory = counted(
        (config: DeploymentConfig, r: DeploymentDeps): FakeEngine => ({
          type: 'sqlite',
          path: r.dbPath,
          db: { name: `db-at-${r.dbPath}` },
        }),
      )

      const graph = ResolverGraph.define<DeploymentConfig, DeploymentDeps>({
        dbPath: (config) => `${config.dataDir}/data.db`,
        credentialStorePath: (config) => `${config.dataDir}/credentials.json`,
        engine: engineFactory,
        taskStore: (_config, r) => ({ type: 'task-store', db: r.engine.db }),
        syncMeta: (_config, r) => ({ type: 'sync-meta', db: r.engine.db }),
      })

      const deps1 = graph.resolve({ dataDir: '/tmp/a' })
      const deps2 = graph.resolve({ dataDir: '/tmp/b' })

      deps1.engine
      deps2.engine

      expect(engineFactory.calls).toBe(2)
      expect(deps1.engine.path).toBe('/tmp/a/data.db')
      expect(deps2.engine.path).toBe('/tmp/b/data.db')
    })
  })
})
