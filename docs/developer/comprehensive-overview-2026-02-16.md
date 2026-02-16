Important: This document relates to Max as it was on Monday 16th Feb.
Max is moving _very_ fast, and so it's not safe to assume all details remain the same if time has moved on.

# Max Architecture Overview

Data pipeline CLI that syncs external SaaS data (Linear, HubSpot, Google Drive, etc.) into local SQLite via typed connectors. Bun runtime, TypeScript, monorepo.

---

## Package Layers

Bottom-up dependency order. Each layer only imports from layers below it.

- **@max/core** — Type primitives, interfaces, zero implementations
  - EntityDef, Ref, Field, Schema, EntityInput, EntityResult, Page, Batch
  - Engine interface (storage), SyncPlan/Step (declarative sync), Loader/Resolver/Seeder (connector contracts)
  - Context system, Scope system, Branded types, Lifecycle, MaxError
- **@max/connector** — Connector abstractions atop core
  - ConnectorDef (static descriptor), ConnectorModule (def + initialise fn), Installation (live instance)
  - ConnectorRegistry (discovery/lazy-loading), CredentialStore/CredentialProvider
  - OnboardingFlow (step-based setup pipeline)
- **@max/storage-sqlite** — SQLite Engine implementation (`bun:sqlite`)
- **@max/execution** — Task/sync orchestration interfaces
  - TaskStore, TaskRunner, SyncExecutor, SyncHandle, PlanExpander, SyncQueryEngine, SyncMeta
- **@max/execution-local** — In-memory implementations (InMemoryTaskStore, InMemorySyncMeta, LocalSyncQueryEngine, DefaultTaskRunner)
- **@max/execution-sqlite** — SQLite implementations (SqliteTaskStore, SqliteSyncMeta, SqliteSyncQueryEngine)
- **@max/app** — Application orchestration layer
  - MaxProjectApp (project-scoped coordinator), MaxGlobalApp (init)
  - ProjectManager interface / FsProjectManager (installation CRUD)
  - ProjectDaemonManager interface / FsProjectDaemonManager (daemon lifecycle)
  - InstallationRuntime (per-installation composition root — wires engine + executor + connector)
  - FsConnectorRegistry, ProjectConfig
- **@max/cli** — CLI commands + daemon socket server
  - Rust binary shim → spawns Bun process (direct or daemonized)

---

## Core Type System

- **EntityDef** — Named entity with typed fields (Field.string, Field.ref, Field.collection, etc.)
- **Ref\<E, S\>** — Type-safe reference to an entity. Polymorphic over Scope (local vs system)
- **EntityInput** — Data payload for storing an entity (ref + field values)
- **EntityResult** — Proxy-based typed result from loading an entity
- **Schema** — Collection of EntityDefs with designated roots
- **Scope** — LocalScope (within one installation) vs SystemScope (cross-installation). Refs upgrade at boundaries
- **Branded types** — SoftBrand (naked assignment OK) for IDs; HardBrand (factory required) for validated values
- **Type + Companion Object** — Single name serves as both TypeScript type and value namespace. Used for schematic types only (EntityDef, Ref, Page, etc.), never services

---

## Connector Model

A connector is a self-contained package that teaches Max how to sync from one external system.

- **ConnectorDef** — Pure data descriptor: name, schema, resolvers[], seeder, onboarding flow
- **ConnectorModule** — Pairs ConnectorDef with `initialise(config, credentials) → Installation`
- **Installation** — Live runtime instance. Holds hydrated Context (API clients, tokens, workspace IDs)
- **Resolution flow**: ConnectorRegistry stores `name → lazy loader`. On first `resolve(name)`, dynamic-imports the connector package, caches the module
  - Currently: FsConnectorRegistry with hardcoded name→package map (`{ acme: "@max/connector-acme", ... }`)
  - Designed for: pluggable registry implementations (remote, marketplace, etc.)
- **Onboarding** — Step pipeline (InputStep, ValidationStep, SelectStep, CustomStep) that collects config + credentials before first sync
- **Credentials** — CredentialStore (get/set/has/delete key-value) → CredentialProvider (connector-facing, typed handles). FsCredentialStore persists as flat JSON per installation

### Connector internals (what a connector author provides)

- **Entities** — EntityDef declarations with fields
- **Context** — Class extending Context base. Holds API client instances, workspace IDs, etc. Initialized by `ConnectorModule.initialise()`
- **Resolvers** — One per entity. Maps every field to a Loader: `Resolver.for(Entity, { field: SomeLoader.field("name") })`
- **Loaders** — Data fetchers. Four types:
  - `Loader.entity()` — single entity by ref
  - `Loader.entityBatched()` — batch fetch (preferred when API supports it)
  - `Loader.collection()` — paginated parent→child relationship
  - `Loader.raw()` — escape hatch
- **Seeder** — Produces initial SyncPlan from context + engine state

---

## Sync Pipeline

Declarative plan → task graph → drain loop.

1. **Seeder.seed(context, engine)** → SyncPlan (pure data)
2. **SyncPlan** — Ordered list of Steps. Each Step = target + operation
   - Targets: `forRoot(ref)`, `forAll(EntityDef)`, `forOne(ref)`
   - Operations: `loadFields("f1", "f2")`, `loadCollection("children")`
   - `Step.concurrent([...])` for parallel groups
3. **PlanExpander.expandPlan()** → TaskTemplate[] (task graph with dependency edges)
4. **TaskStore.enqueueGraph()** — Registers all tasks with dependencies resolved to IDs
5. **SyncExecutor.drainTasks()** — Single loop: claim → execute → complete → unblock dependents
   - Claim: atomic grab of next pending task for this sync
   - Execute: delegates to TaskRunner
   - Complete: mark done, unblock blocked tasks, check parent completion
   - Parent tasks: move to `awaiting_children`, auto-complete when all children done
6. **DefaultTaskRunner.execute(task)** — Dispatches to correct Loader via ExecutionRegistry, calls engine.store(), updates SyncMeta
7. **SyncHandle** — Returned immediately. Exposes: status, pause/resume/cancel, completion() promise, task counts

State lives in TaskStore — model survives restarts.

---

## Execution Model & Process Topology

### Current process architecture

```
User
  │
  ▼
Rust shim (max binary)
  │
  ├── Direct mode: spawns Bun inline, runs command, exits
  │
  └── Daemon mode: spawns Bun with --daemonized
        │
        ▼
      Project Daemon (1 Bun process per project)
        ├── Unix socket server at ~/.max/daemons/<hash>/daemon.sock
        ├── Owns 1 CLI instance → 1 MaxProjectApp
        ├── MaxProjectApp holds Map<InstallationId, InstallationRuntime>
        │     ├── runtime("acme")       → InstallationRuntime (acme/default)
        │     ├── runtime("acme", "v2") → InstallationRuntime (acme/v2)
        │     └── runtime("linear")     → InstallationRuntime (linear/default)
        └── All runtimes share the Bun process, run in-process
```

### Two execution modes

- **Direct mode** — Rust shim spawns Bun, CLI parses argv, runs one command, process exits. No state survives between invocations. Runtime is created, used, torn down within the command
- **Daemon mode** — Rust shim spawns a long-lived Bun process per project. Writes PID to `~/.max/daemons/<project-hash>/daemon.pid`. Listens on Unix socket. Rust shim connects as a client per command, sends JSONL request, receives JSONL response. Daemon stays alive between commands

### Daemon scoping

- Daemons are **project-scoped** — one daemon per `.max/` project root
- Daemon identity: SHA-256 hash of resolved project root path → 12-char hex → directory under `~/.max/daemons/<hash>/`
- GlobalConfig tracks `mode: 'daemon' | 'direct'` — set by Rust shim's `--daemonized` flag
- ProjectDaemonManager (interface) manages lifecycle: start, stop, enable/disable, status. FsProjectDaemonManager implements via Bun.spawn + PID files + sentinel files
- `daemon list` discovers all daemons globally (FsProjectDaemonManager scans `~/.max/daemons/*/project.json`)

### Installation runtimes within a daemon

- MaxProjectApp lazily creates InstallationRuntime on first `runtime(connector, name)` call
- Caches by InstallationId — subsequent commands reuse the warm runtime (DB open, connector initialized, etc.)
- Each runtime owns: SqliteEngine (its own `data.db`), SyncExecutor, TaskStore, SyncMeta, Installation (live connector context)
- All runtimes run **in-process** — no isolation between installations. A crash in one connector's loader takes down the whole daemon
- `stopAll()` tears down all runtimes (lifecycle.stop on each). No graceful per-installation restart

### Lifecycle protocol

- All services implement `Lifecycle` (start/stop) from @max/core
- `LifecycleManager.auto(() => [dep1, dep2])` — dependency-ordered startup, reverse-ordered shutdown
- InstallationRuntime's lifecycle tree: Installation → Engine (start opens DB, stop closes it)
- SyncExecutor/TaskStore are not lifecycle-managed — they're stateless coordinators over the TaskStore data

### What the daemon does NOT do (current limitations)

- No installation-level process isolation — all installations share one Bun process
- No automatic sync scheduling — syncs are triggered by explicit `max sync` commands
- No watching/webhook handling — no persistent event listeners per installation
- No health monitoring — if the daemon dies, stale PID/socket remain until next `max daemon status`
- No cross-project coordination — each project daemon is fully independent

---

## Storage & Engine

- **Engine** (interface in core) — `load(ref, fields)`, `store(input)`, `query(def)`, `loadCollection(ref, field)`. Extends Lifecycle
- **QueryBuilder** — Fluent: `engine.query(Entity).where(field, op, value).limit(n).select(...fields)`
- **SqliteEngine** — Current sole implementation. Opens `bun:sqlite` DB, auto-creates tables from Schema, handles type mapping (Date↔ISO, boolean↔int, Ref↔ID string)
- **SyncMeta** — Tracks per-field sync timestamps. `recordFieldSync()`, `staleFields()`, `isFullySynced()`. Enables incremental sync
- **Execution tables** — `_max_tasks`, `_max_sync_meta` colocated in same SQLite DB alongside entity data

---

## Swappable Module Boundaries

Interfaces are defined in core/execution packages. Implementations live in dedicated packages. Current implementations are SQLite-based but the interfaces are storage-agnostic.

| Interface | Package | Current impl | Swappable for |
|---|---|---|---|
| Engine | core | SqliteEngine (storage-sqlite) | Postgres, DuckDB, in-memory |
| TaskStore | execution | SqliteTaskStore (execution-sqlite) + InMemoryTaskStore (execution-local) | Redis, Postgres, distributed queue |
| SyncMeta | core | SqliteSyncMeta (execution-sqlite) + InMemorySyncMeta (execution-local) | Redis, Postgres |
| SyncQueryEngine | execution | SqliteSyncQueryEngine (execution-sqlite) + LocalSyncQueryEngine (execution-local) | Any engine+meta combo |
| CredentialStore | connector | FsCredentialStore (app) + InMemoryCredentialStore | Keychain, Vault, encrypted store |
| ProjectManager | app | FsProjectManager | Cloud-backed, DB-backed |
| ProjectDaemonManager | app | FsProjectDaemonManager | Remote process manager, container orchestrator |
| ConnectorRegistry | connector | FsConnectorRegistry (app) | Remote registry, marketplace |
| FlowController | core | NoOpFlowController | Rate limiter, backpressure |

**Composition root**: `InstallationRuntimeImpl.create()` is currently the wiring point — hardcodes SQLite selections. Intended to be refactored into a configurable factory or DI-style assembly.

---

## Current Filesystem Layout (FsProjectManager / FsProjectDaemonManager)

The disk structures below are artifacts of the current filesystem-backed implementations — **not** intrinsic to Max's abstractions. ProjectManager, ProjectDaemonManager, and CredentialStore are all interfaces; the Fs-prefixed classes are one set of implementations. A remote-backed ProjectManager or a container-based ProjectDaemonManager would not produce these directories at all.

**Project-local** (FsProjectManager):
```
.max/                              ← created by FsProjectManager.init()
  installations/
    <connector>/
      <slug>/                      ← "default", "default-2", etc.
        installation.json          ← connector name, id, config, connectedAt
        credentials.json           ← FsCredentialStore: flat key-value JSON
        data.db                    ← SqliteEngine: entity tables + execution tables
```

**Global** (FsProjectDaemonManager):
```
~/.max/                            ← GlobalConfig.maxHomeDirectory
  daemons/
    <project-hash>/                ← SHA-256(resolved project root)[:12]
      project.json                 ← { root: "/path/to/project" }
      daemon.sock                  ← Unix socket (daemon mode)
      daemon.pid                   ← PID file
      daemon.disabled              ← sentinel: daemon disabled if present
      daemon.log                   ← log output (future)
```

Both layouts are owned by their respective service implementations. The core abstractions (ProjectManager, Engine, CredentialStore) are path-agnostic.

---

## Error System

- **MaxError** — Composable error with facets (typed metadata) and boundaries (domain grouping)
- Pattern: `boundary = MaxError.boundary("domain")` → `ErrFoo = boundary.define("code", { facets, message })`
- Errors carry structured data via facets, render with `prettyPrint({ color })`
- CLI wraps command execution to catch and format MaxErrors

---

## Emerging Design

- [[Max Supervision Model]] — Unifying project and installation lifecycle management under a common Supervisor abstraction
