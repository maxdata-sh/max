# ResolverGraph

Declarative dependency resolution with cascading and memoization.

Define a graph of named resolvers where each can depend on others via property access. Dependencies cascade automatically - override one node and everything downstream re-resolves through it.

## Quick Start

```typescript
import { ResolverGraph } from "@max/core"

interface Config {
  dataDir: string
}

interface Deps {
  dbPath: string
  engine: Engine
  taskStore: TaskStore
  syncMeta: SyncMeta
}

const graph = ResolverGraph.define<Config, Deps>({
  dbPath:    (config)    => `${config.dataDir}/data.db`,
  engine:    (config, r) => SqliteEngine.open(r.dbPath),
  taskStore: (config, r) => new SqliteTaskStore(r.engine.db),
  syncMeta:  (config, r) => new SqliteSyncMeta(r.engine.db),
})

const deps = graph.resolve({ dataDir: "/var/max/workspace" })
deps.taskStore  // lazily resolves: taskStore → engine → dbPath
```

## How It Works

Each factory receives two arguments:

- **`config`** - the raw input config (same for all factories in a single `resolve()` call)
- **`resolved`** - a memoized context object. Accessing `resolved.someKey` lazily triggers that key's factory. Each factory runs at most once per `resolve()` call.

Dependencies are implicit in property access. If `taskStore`'s factory reads `r.engine`, that's a dependency edge. No explicit declaration needed.

```
config.dataDir
    └─ dbPath
         └─ engine
              ├─ taskStore
              └─ syncMeta
```

## Override Cascading

`.with()` creates a new graph with some factories replaced. Downstream dependents cascade automatically through the overridden node. The original graph is not modified.

### Override a leaf - only that value changes

```typescript
const withTestCreds = graph.with({
  credentialStore: () => new InMemoryCredentialStore({ API_KEY: "test" }),
})
// engine, taskStore, syncMeta are unaffected
```

### Override an intermediate node - everything downstream shifts

```typescript
const inMemory = graph.with({
  engine: () => SqliteEngine.open(":memory:"),
})
const deps = inMemory.resolve({ dataDir: "/unused" })
// deps.taskStore → uses the :memory: engine (cascaded)
// deps.syncMeta  → uses the :memory: engine (cascaded)
// deps.dbPath    → never resolved (nobody accessed it)
```

### Override a root - the entire tree shifts

```typescript
const redirected = graph.with({
  dbPath: () => "/tmp/ephemeral/test.db",
})
const deps = redirected.resolve({ dataDir: "/ignored" })
// deps.engine    → SqliteEngine at /tmp/ephemeral/test.db
// deps.taskStore → uses that engine
// deps.syncMeta  → uses that engine
```

### Compose overrides

```typescript
const fast = graph.with({
  engine: () => SqliteEngine.open(":memory:"),
})
const fastWithTestCreds = fast.with({
  credentialStore: () => new InMemoryCredentialStore(),
})
// Both overrides active. taskStore cascades through :memory: engine.
```

## Laziness

Resolution is lazy - only the properties you access get resolved. Accessing `deps.credentialStore` will never trigger the `engine` factory if `credentialStore` doesn't depend on it.

```typescript
const deps = graph.resolve(config)
deps.credentialStore  // only resolves credentialStore (and its deps)
                      // engine, taskStore, syncMeta are never touched
```

## Memoization

Each value is computed once per `resolve()` call. If `taskStore` and `syncMeta` both access `r.engine`, the engine factory runs once and both get the same instance.

Separate `resolve()` calls are fully independent - no shared state between them.

## Error Handling

**Circular dependencies** are detected and throw `ErrCircularDependency` with the full chain:

```typescript
const bad = ResolverGraph.define<{}, { a: string; b: string }>({
  a: (_, r) => r.b,
  b: (_, r) => r.a,
})
bad.resolve({}).a
// throws ErrCircularDependency { chain: ["a", "b", "a"] }
```

**Factory errors** are wrapped in `ErrResolutionFailed` with the key name, so you know which resolver failed. Inner resolver errors propagate without double-wrapping.

## Object Protocol

The resolved object supports standard JavaScript operations:

```typescript
const deps = graph.resolve(config)

// Spreading (resolves all properties)
const plain = { ...deps }

// Object.keys
Object.keys(deps)  // ["dbPath", "engine", "taskStore", "syncMeta"]

// "in" operator
"engine" in deps  // true
```

## Comparison with `makeLazy`

Both provide lazy, memoized property resolution. Use `makeLazy` for simple lazy evaluation without parameterisation or overrides. Use `ResolverGraph` when you need:

| | `makeLazy` | `ResolverGraph` |
|---|---|---|
| Lazy + memoized | Yes | Yes |
| Cross-referencing | Via `this` | Via `resolved` parameter |
| Parameterised (config input) | No (use closures) | Yes |
| Override cascading (`.with()`) | No | Yes |
| Circular dependency detection | No (stack overflow) | Yes (`ErrCircularDependency`) |
| Error attribution | No | Yes (`ErrResolutionFailed`) |

## API Reference

### `ResolverGraph.define<TConfig, TShape>(factories)`

Creates a resolver graph.

- **`TConfig`** - the input config type
- **`TShape`** - the output shape (record of resolved values)
- **`factories`** - `{ [K in keyof TShape]: (config: TConfig, resolved: TShape) => TShape[K] }`
- **Returns** `ResolverGraph<TConfig, TShape>`

### `graph.resolve(config)`

Resolves config into a lazily-evaluated, memoized shape. Each property resolves on first access.

- **`config`** - the input config
- **Returns** `TShape` (lazy - properties resolve on access)

### `graph.with(overrides)`

Creates a new graph with some factories replaced. The original graph is not modified.

- **`overrides`** - `Partial<ResolverFactories<TConfig, TShape>>`
- **Returns** `ResolverGraph<TConfig, TShape>`
