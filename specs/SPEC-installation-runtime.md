# Spec: InstallationRuntime

## Motivation

Running `max sync acme:default` today requires bootstrapping a dozen dependencies from scratch: resolve connector, load installation, create credential provider, initialise connector, open DB, create engine, build execution infrastructure, seed, execute. This setup is identical for every operation against an installation (sync, search, webhooks).

The **InstallationRuntime** is a per-installation container that holds all of this state with a managed lifecycle. Operations like sync become a single method call on a runtime that's either already warm (daemon) or lazily constructed (direct mode).

## Consumer API

### CLI handler (sync command)

```typescript
// In CLI.runSync():
const runtime = await this.project.runtime("acme", "default")
const handle = await runtime.sync()
const result = await handle.completion()
// print result summary
```

### Future: search

```typescript
const runtime = await this.project.runtime("acme", "default")
const users = await runtime.engine.query(AcmeUser).all()
```

### MaxProjectApp as runtime manager

```typescript
class MaxProjectApp {
  // Existing methods unchanged...

  /** Get or create a runtime for the given installation. */
  async runtime(connector: string, name?: string): Promise<InstallationRuntime>

  /** List all currently active runtimes. */
  listRuntimes(): InstallationRuntimeInfo[]

  /** Stop all active runtimes (for clean shutdown). */
  stopAll(): Promise<void>
}
```

Runtimes are cached by installation ID. Requesting the same installation twice returns the same instance. `listRuntimes()` returns metadata about what's currently alive — useful for introspection (`max status` or similar).

## InstallationRuntime interface

```typescript
interface InstallationRuntime {
  /** Installation metadata (connector, name, id, connectedAt) */
  readonly info: ManagedInstallation

  /** Query engine for this installation's data */
  readonly engine: Engine

  /** Kick off a full sync. Seeds on first run, re-seeds on subsequent. */
  sync(): Promise<SyncHandle>

  /** Tear down: close DB, stop credential refresh, release resources. */
  stop(): Promise<void>
}

/** Lightweight snapshot of a running runtime, for listing/introspection. */
interface InstallationRuntimeInfo {
  readonly info: ManagedInstallation
  readonly startedAt: Date
}
```

This is an interface — the concrete implementation lives in `@max/app` as a class (not a Type+Companion Object, since this is a service with side effects).

## Lifecycle

### Construction (inside `MaxProjectApp.runtime()`)

1. `projectManager.get(connector, name)` — load `ManagedInstallation` from disk
2. `connectorRegistry.resolve(connector)` — load `ConnectorModule`
3. `projectManager.credentialStoreFor(managed)` — get `CredentialStore`
4. `CredentialProvider.create(credStore)` — create `CredentialProvider`
5. `mod.initialise(managed.config, credentials)` — get `Installation` (context + lifecycle)
6. `projectManager.dataPathFor(managed)` — get DB path (encapsulated, no path construction outside ProjectManager)
7. Open SQLite DB at that path
8. `SqliteSchema.registerSchema(mod.def.schema)` + `ensureTables(db)`
9. `SqliteExecutionSchema.ensureTables(db)`
10. Construct `SqliteEngine`, `SqliteSyncMeta`, `SqliteTaskStore`
10. Construct `ExecutionRegistryImpl` from `mod.def.resolvers`
11. Construct `DefaultTaskRunner` with engine, syncMeta, registry, `NoOpFlowController`, contextProvider
12. Construct `SyncExecutor` with taskRunner + taskStore
13. `installation.start()` — start API client, credential refresh schedulers

### Teardown (`stop()`)

1. `installation.stop()` — stop credential refresh
2. Close SQLite DB connection

### Caching in MaxProjectApp

```typescript
// Keyed by InstallationId (UUID), not connector:name
private runtimes = new Map<InstallationId, InstallationRuntime>()
```

`runtime()` checks the cache first. Cache is keyed by `InstallationId` (from `ManagedInstallation.id`) since names can be ambiguous (default resolution).

## Sync operation

`runtime.sync()` is thin:

```typescript
async sync(): Promise<SyncHandle> {
  const plan = await this.seeder.seed(this.installation.context, this.engine)
  return this.executor.execute(plan)
}
```

The seeder creates root entities (upsert-safe) and returns a `SyncPlan`. The executor expands the plan into a task graph, drains it, and returns a `SyncHandle` immediately. The caller decides whether to `await handle.completion()` or monitor it.

## DB location

Per-installation SQLite database, co-located with existing installation files:

```
.max/installations/acme/default/
  installation.json
  credentials.json
  data.db              ← new
```

Path is derived from `ProjectManager.dataPathFor(installation)` — all installation path logic stays encapsulated in ProjectManager. The runtime never constructs file paths itself.

One DB per installation — clean isolation, no table name collisions across connectors, easy to reason about.

## Package location

`InstallationRuntime` lives in `@max/app` — the composition layer. It imports from existing packages:

- `@max/core` — Engine, SyncPlan, NoOpFlowController, Seeder, etc.
- `@max/connector` — ConnectorModule, CredentialProvider, Installation
- `@max/execution` — SyncExecutor, SyncHandle
- `@max/execution-local` — DefaultTaskRunner, ExecutionRegistryImpl
- `@max/execution-sqlite` — SqliteTaskStore, SqliteSyncMeta, SqliteExecutionSchema
- `@max/storage-sqlite` — SqliteEngine, SqliteSchema

New deps added to `@max/app/package.json`:
- `@max/execution`, `@max/execution-local`, `@max/execution-sqlite`, `@max/storage-sqlite`

## File structure

```
packages/app/src/
  runtime/
    installation-runtime.ts    # Interface + concrete implementation
    index.ts                   # Re-export
  entrypoints/
    max-project-app.ts         # Add runtime() method + cache
```

## Out of scope (for now)

- Installation identifier type (parked per discussion)
- CLI command definition (separate, uses this)
- Search, webhooks, and other runtime operations (future)
- Runtime health checks or auto-restart
- Multiple concurrent syncs on the same runtime
