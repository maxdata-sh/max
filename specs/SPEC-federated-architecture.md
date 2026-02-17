# SPEC: Federated Architecture

> Authored: 2026-02-16. Captures design decisions from architectural discussion.
> Status: Design complete, not yet implemented. Current codebase does not reflect this spec.

## Overview

Max's runtime architecture is federated into exactly **three fixed levels**: Global, Workspace, and Installation. Each level is a distinct operational boundary that can be deployed independently — in-process, as a local daemon, in Docker, or on a remote server. The deployment topology is hidden behind uniform abstractions.

Core design principles:
- **Deployment-agnostic**: any level can run anywhere without changing its interface
- **Scope-driven data flow**: entities carry scope metadata that gets richer as data flows upward
- **Identity assigned by parent**: children don't know their own parent-assigned IDs
- **Uniform operational surface**: lifecycle, health, transport are the same at every boundary
- **Level-specific protocols**: what a node *does* varies by level; how you *talk to it* doesn't

---

## 1. Levels

Exactly three. Not recursive. Each has a clear role.

### 1.1 Global

The entry point. Knows about all workspaces available to this host or application.

- **Manages**: Workspaces
- **Assigns to children**: WorkspaceId
- **Scope**: GlobalScope
- **Examples**: the CLI running outside any workspace context; a cloud control plane

### 1.2 Workspace

Groups installations. Provides cross-installation operations (unified search, identity correlation). This is what the current codebase calls a "project."

- **Manages**: Installations
- **Assigns to children**: InstallationId
- **Scope**: WorkspaceScope
- **Examples**: a local `.max/` project; a team workspace on a server; a CI environment

### 1.3 Installation

Leaf node. One connector, one schema, one data store. Produces entities at LocalScope. Cannot subdivide further.

- **Manages**: nothing (leaf)
- **Scope**: LocalScope
- **Examples**: a single HubSpot account connection; one Google Workspace OrgUnit

### 1.4 Why not four levels?

The "large installation that wants to segment" case (e.g., Google Workspace with multiple OrgUnits) is better modeled as one workspace containing N installations — one per OrgUnit. The workspace already handles orchestration across children. Allowing installations to subdivide would require the installation interface to expose both orchestration and data operations, breaking the clean "installation = atomic leaf" invariant.

---

## 2. Scope System

Scope is a **first-class principle** — not a convenience, not optional. Any concept that crosses a level boundary must be scope-aware. This is enforced in the type system.

### 2.1 Scope as a universal cross-cutting concern

Scope applies to **everything** that can travel between levels:

- **Refs**: `Ref<E, LocalScope>` → `Ref<E, WorkspaceScope>`
- **Entity results**: `EntityResult<E, LocalScope>` → `EntityResult<E, WorkspaceScope>`
- **Engine**: `Engine<LocalScope>` (direct storage) vs `Engine<WorkspaceScope>` (fan-out routing)
- **Errors**: errors originating from an installation carry installation-scoped context; a workspace wrapping that error adds workspace-scoped context
- **Queries/filters**: scope-aware — a workspace-level filter can reference InstallationId; that concept doesn't exist at LocalScope

If a type can cross a boundary, it **must** be parameterized by scope. This is not a soft guideline — it's a type-system constraint. Unscoped data cannot leave the level it was produced at.

### 2.2 Scope types

Each level boundary adds exactly one identity. Each level adds exactly one piece of contextual identity — no more, no less.

| Scope | Carries | Produced by |
|---|---|---|
| LocalScope | nothing beyond entity's own ref | Installation |
| WorkspaceScope | + InstallationId | Workspace (stamps on data from installations) |
| GlobalScope | + WorkspaceId + InstallationId | Global (stamps on data from workspaces) |

### 2.3 Flow direction

```
Identity flows DOWN (parent assigns IDs to children)
Data flows UP (child produces, parent scope-upgrades)
```

- A workspace assigns an InstallationId to each child. The installation never knows this ID.
- When the workspace pulls data from an installation, it stamps the InstallationId onto every entity result, upgrading `EntityResult<E, LocalScope>` → `EntityResult<E, WorkspaceScope>`.
- Same pattern at the Global→Workspace boundary.

### 2.4 Scope upgrade mechanism

Scope upgrade is a cascade operation. Types that implement `ScopeUpgradeable` know how to upgrade themselves — including their internal fields. For example, upgrading an `EntityResult` cascades through all its ref-typed fields, because those are also `ScopeUpgradeable`.

The **parent initiates** the upgrade (because only the parent knows the identity to stamp), but the **thing itself executes** the cascade (because only it knows its internal structure). The parent calls `thing.upgrade(scopeContext)` where `scopeContext` carries the parent-assigned identity (e.g., `{ installationId }`).

This means there is no standalone "ScopeBoundary" abstraction. The boundary is simply the point where the parent calls `upgrade()` on data received from a child. The upgrade logic is distributed across the types themselves via `ScopeUpgradeable`.

### 2.5 Child portability

Because children don't know their parent-assigned identity, they are portable. The same physical installation process can be bound into two different workspaces with different InstallationIds. Identity is the parent's concern, not the child's.

### 2.6 Scope in the type system

The existing `Ref<E, S>` and scope polymorphism already model this. `ScopeUpgradeable` is the mechanism for boundary crossing. Future work: `EntityResult<E, S>` will carry scope through results, not just refs.

---

## 3. Infrastructure Abstractions

These are level-agnostic. They provide the uniform operational surface that every boundary shares.

### 3.1 Supervised

The contract a child exposes to its parent.

```
Supervised {
  health(): HealthStatus
  start(): Promise<StartResult>
  stop(): Promise<StopResult>
}
```

Lifecycle methods are **required**, not optional. Even a remote installation has meaningful start/stop semantics — the remote *server* is always alive, but the *installation within it* has a lifecycle (`start()` = initialize connector context, open DB, warm caches; `stop()` = tear down, release resources). The server executes these on behalf of the installation.

`start()` and `stop()` return result types (not void) to communicate outcome — success, already running, graceful refusal, or error. A catastrophically unreachable child produces a transport error, which is distinct from a lifecycle error. The implementation decides what start/stop mean; the interface guarantees they exist.

Note: `start()` also serves as an `onStart` hook — it's the point where initialization runs. There is no separate initialization step.

### 3.2 NodeHandle\<R extends Supervised\>

A parent's view of one managed child. The handle **is** the typed protocol surface — the caller interacts with it via protocol methods (`sync()`, `search()`, etc.), not via a transport layer.

```
NodeHandle<R extends Supervised> {
  id: ParentAssignedId           // InstallationId or WorkspaceId
  providerKind: ProviderKind     // informational tag: "fs", "remote", "docker", "in-process"
  protocol: R                    // the typed protocol surface — real object or proxy
}
```

`R extends Supervised` — the Supervisor can call `health()`, `start()`, `stop()` on any handle via `handle.protocol`. The `R` also carries the level-specific protocol (InstallationProtocol, WorkspaceProtocol), so the orchestrator can call `handle.protocol.sync()`, etc.

`providerKind` is a **metadata tag** set by the ChildProvider at creation time. The Supervisor never branches on it — but it can include it in health reports, logs, status output, and diagnostics. It answers "what kind of handle is this?" without leaking deployment behavior into the abstraction.

**How transport is hidden**: the `protocol` field is either the real implementation (InProcess) or a proxy that internally serializes calls over a wire protocol (Fs/Docker/Remote). The caller cannot tell the difference — it just calls typed methods.

```
InProcess:  handle.protocol.sync() → real.sync()           // direct call
Fs:         handle.protocol.sync() → [serialize → Unix socket → deserialize] → real.sync()
Remote:     handle.protocol.sync() → [serialize → HTTP → deserialize] → real.sync()
```

Transport (Unix sockets, HTTP, etc.) is an **internal implementation detail** of the proxy, not a public abstraction. Each provider package owns both the client proxy and the server dispatcher for its transport type — they're co-located because they must agree on the wire format. See section 7 (Provider Packages) for details.

### 3.4 ChildProvider\<R extends Supervised\>

Factory + type-specific supervisor for one deployment strategy. Each provider knows how to create or connect to children of one hosting type, and how to supervise them using type-appropriate mechanisms.

```
ChildProvider<R extends Supervised> {
  kind: ProviderKind                          // "fs", "remote", "docker", "in-process"
  create(config): NodeHandle<R>              // spawn a new child
  connect(location): NodeHandle<R>           // bind to an existing child
  list(): NodeHandle<R>[]                    // children this provider manages
}
```

Examples:
- **FsChildProvider** — spawns local Bun processes. Returns handles whose `protocol` is a proxy that serializes calls over Unix sockets
- **RemoteChildProvider** — connects to a URL. Returns handles whose `protocol` is a proxy that serializes calls over HTTP
- **DockerChildProvider** — spawns containers. Returns handles whose `protocol` is a proxy that serializes calls over mapped ports
- **InProcessChildProvider** — instantiates in same process. Returns handles whose `protocol` is the real implementation directly (no proxy, no serialization)

Providers are **pluggable** — the parent registers providers by target type. Adding a new deployment strategy (e.g., DockerChildProvider) doesn't require modifying the parent.

### 3.5 Supervisor\<R extends Supervised\>

Aggregates across ChildProviders. Provides a unified view of all children regardless of hosting type.

```
Supervisor<R extends Supervised> {
  register(handle: NodeHandle<R>): void
  unregister(id): void
  get(id): NodeHandle<R>
  list(): NodeHandle<R>[]
  health(): AggregatedHealthStatus    // delegates to each child
}
```

A workspace with 2 local installations and 1 remote installation has one Supervisor that aggregates across an FsChildProvider (2 handles) and a RemoteProvider (1 handle). `list()` returns all 3. `health()` checks all 3.

The Supervisor does **not** know about deployment details. It works purely with NodeHandles. It can however report `providerKind` in diagnostics — e.g., "2 fs handles, 1 remote handle."

### 3.6 Supervisor ↔ ChildProvider relationship

These are **peers**, not a hierarchy. A level-specific orchestrator (e.g., WorkspaceMax) owns both and coordinates between them:

1. **Creating a child**: orchestrator picks the right ChildProvider based on target type → calls `provider.create(config)` → gets a NodeHandle → registers it with the Supervisor
2. **Listing children**: Supervisor aggregates across all providers via `list()`
3. **Lifecycle**: Supervisor delegates `start()`/`stop()` to each handle via `handle.protocol` — the protocol is either the real implementation or a proxy, both of which know how to execute lifecycle for their deployment type

The Supervisor doesn't know about providers. The providers don't know about the Supervisor. The orchestrator wires them together. This keeps both abstractions clean and independently testable.

---

## 4. Protocol Surfaces

Each level has a specific protocol — what messages it accepts and what operations it supports. These are delivered over the uniform Transport abstraction.

### 4.1 InstallationProtocol

The leaf node. Does the actual work of syncing and querying.

```
InstallationProtocol {
  sync(): SyncHandle
  search(filter): EntityResult<E, LocalScope>[]
  schema(): Schema
  onboard(): void                   // initial or re-onboard
  reconfigure(config): void
  engine: Engine<LocalScope>
}
```

No Supervisor. No children. This is the atomic unit.

### 4.2 WorkspaceProtocol

Manages installations. Provides cross-installation operations.

**Own surface (workspace-level operations):**

```
WorkspaceProtocol {
  // Installation management
  installations: Supervisor<InstallationHandle>

  // Cross-installation operations (fan-out, merge, scope-upgrade)
  search(filter): EntityResult<E, WorkspaceScope>[]

  // Installation access (scope-upgrading proxy)
  get(installationId): ScopedInstallationHandle

  // Scoped engine for cross-installation queries
  engine: Engine<WorkspaceScope>

  // Future: identity correlation across installations
}
```

**ScopedInstallationHandle (returned by `get()`):**

A proxy that exposes the full InstallationProtocol but scope-upgrades all results. The caller interacts with it exactly as they would with an installation, but receives WorkspaceScope results.

```
ScopedInstallationHandle {
  // Full InstallationProtocol — same methods
  sync(): SyncHandle
  search(filter): EntityResult<E, WorkspaceScope>[]    // ← upgraded
  schema(): Schema
  onboard(): void
  reconfigure(config): void
  engine: Engine<WorkspaceScope>                        // ← upgraded
}
```

The workspace constructs this proxy by wrapping the raw NodeHandle with the assigned InstallationId. The proxy calls `result.upgrade({ installationId })` on all data received from the child — the result cascades the upgrade through its internal structure via `ScopeUpgradeable`. The caller never sees LocalScope entities — scope upgrade is transparent.

**Cross-installation search** is then straightforward:

```
workspace.search(filter)
  = workspace.list()
      .flatMap(installation => workspace.get(installation.id).search(filter))
```

Each `get(id).search()` already returns WorkspaceScope results (scope-upgraded by the proxy), so the workspace just merges.

### 4.3 GlobalProtocol

Manages workspaces. Entry point for the system.

```
GlobalProtocol {
  // Workspace management
  workspaces: Supervisor<WorkspaceHandle>

  // Workspace access (scope-upgrading proxy)
  get(workspaceId): ScopedWorkspaceHandle

  // Cross-workspace operations
  search(filter): EntityResult<E, GlobalScope>[]
  engine: Engine<GlobalScope>
}
```

Same pattern as Workspace→Installation: `get(workspaceId)` returns a scope-upgrading proxy.

### 4.4 Why option (a) — handle-based access

The workspace exposes `get(installationId)` which returns a handle with the full InstallationProtocol. This was chosen over two alternatives:

- **Option (b)**: `workspace.sync(installationId)`, `workspace.schema(installationId)`, etc. — rejected because it duplicates every installation method on the workspace surface. Adding a method to InstallationProtocol would require updating WorkspaceProtocol too.
- **Option (c)**: Some installation methods not exposed — rejected because there's no clear rubric for what to exclude. A workspace is a superset; preventing access to installation operations is artificial.

Option (a) keeps the workspace's own surface clean (only workspace-level operations) while giving full installation access through a scope-upgrading proxy. No duplication, no artificial restrictions.

---

## 5. Engine\<TScope\>

The Engine interface is parameterized by scope. This is the key mechanism for transparent fan-out.

### 5.1 Scoped engine hierarchy

| Engine | Scope | Behavior |
|---|---|---|
| Engine\<LocalScope\> | Installation | Direct storage access (SqliteEngine, etc.) |
| Engine\<WorkspaceScope\> | Workspace | Fan-out to child Engine\<LocalScope\> instances, scope-upgrade results |
| Engine\<GlobalScope\> | Global | Fan-out to child Engine\<WorkspaceScope\> instances, scope-upgrade results |

### 5.2 Fan-out engine

A workspace's Engine\<WorkspaceScope\> doesn't store data itself (initially). It:

1. Receives a query
2. Routes to relevant child engines (all installations, or filtered subset)
3. Collects results
4. Scope-upgrades each result (stamps InstallationId)
5. Merges and returns

This is a lightweight routing implementation. It can be replaced later by a heavier-weight implementation (caching layer, materialized cross-installation views) transparently — because it's behind the Engine interface.

### 5.3 Scope in queries

A search at workspace level may include filters that reference installation-scoped metadata (e.g., "all files from the acme installation"). The query filter system needs to be scope-aware — it can filter by InstallationId at WorkspaceScope, but that concept doesn't exist at LocalScope.

---

## 6. Composition Summary

How the pieces assemble at each level.

```
GlobalMax
  = Supervisor<WorkspaceHandle>
  + GlobalProtocol
  + Engine<GlobalScope>
  + ChildProviders for workspaces
  + Scope upgrade via ScopeUpgradeable at Workspace→Global boundary

WorkspaceMax
  = Supervisor<InstallationHandle>
  + WorkspaceProtocol
  + Engine<WorkspaceScope>
  + ChildProviders for installations: [FsChildProvider, RemoteChildProvider, InProcessChildProvider, ...]
  + Scope upgrade via ScopeUpgradeable at Installation→Workspace boundary

InstallationMax
  = InstallationProtocol
  + Engine<LocalScope>
  + SyncExecutor + ConnectorContext + TaskStore + SyncMeta
  (leaf — no Supervisor, no scope upgrade, no ChildProviders)
```

---

## 7. Provider Packages

A provider package encapsulates a **deployment strategy** — not a level. It knows how to host, supervise, and communicate with Max nodes using a specific technology (local processes, Docker containers, remote servers, etc.). Each provider package can supply providers for **multiple levels**.

### 7.1 Two axes

Providers sit at the intersection of two independent axes:

**Deployment strategy** (how the child is hosted):
| Strategy | Hosting | Supervision | Transport |
|---|---|---|---|
| Fs | Local OS process (Bun) | PID files, process signals | Unix socket |
| Docker | Container | Docker API | Mapped port / socket |
| Remote | Pre-existing server at a URL | HTTP health ping | HTTP |
| InProcess | Same runtime, no process boundary | Always healthy | Direct method call |

**Level** (what the child is):
| Level | What's running | Protocol |
|---|---|---|
| Installation | InstallationMax — one connector, one data store | InstallationProtocol |
| Workspace | WorkspaceMax — supervisor of installations, cross-installation ops | WorkspaceProtocol |

Every deployment strategy can host either level. A provider package exports providers for each level it supports.

### 7.2 Package structure

Each deployment strategy is its own package. The package exports level-specific ChildProvider implementations that share internal deployment mechanics.

```
@max/provider-fs
  ├── FsInstallationChildProvider    — spawns a Bun process running InstallationMax
  ├── FsWorkspaceChildProvider       — spawns a Bun process running WorkspaceMax
  └── (shared) FsProcessSupervisor   — PID management, Unix socket transport, process signals

@max/provider-docker
  ├── DockerInstallationChildProvider
  ├── DockerWorkspaceChildProvider
  └── (shared) DockerContainerSupervisor

@max/provider-remote
  ├── RemoteInstallationChildProvider
  ├── RemoteWorkspaceChildProvider
  └── (shared) RemoteHttpSupervisor

@max/provider-inprocess
  ├── InProcessInstallationChildProvider
  ├── InProcessWorkspaceChildProvider
  └── (shared) — minimal; direct instantiation
```

Within each package, the shared layer handles deployment-specific mechanics (how to start a process, how to health-check a container, how to connect to a URL). The level-specific providers layer on entrypoint configuration and protocol binding.

### 7.3 What changes between levels within a package

For a given deployment strategy, hosting an installation vs a workspace differs in:

- **Entrypoint / image**: the child process runs a different Max "mode" (installation-level vs workspace-level)
- **Protocol**: what messages the child accepts (InstallationProtocol vs WorkspaceProtocol)
- **Internal composition**: a workspace child itself has a Supervisor + ChildProviders; an installation child is a leaf

The deployment mechanics (process spawn, health ping, transport) are identical. This is why the shared layer exists within each provider package.

### 7.4 Day-one provider matrix

Not all combinations need to exist immediately. The initial implementation covers:

| Package | Installation | Workspace | Notes |
|---|---|---|---|
| @max/provider-inprocess | day 1 | day 1 | Default. Zero overhead. Current InstallationRuntimeImpl is a proto-version |
| @max/provider-fs | day 1 | day 1 | Fs workspace = current daemon model (Bun process per workspace, fast autocomplete). Fs installation = new — each installation gets its own process |
| @max/provider-docker | later | later | When containerized deployment is needed |
| @max/provider-remote | later | later | When pointing at pre-existing remote Max nodes is needed |

**Current codebase mapping**:
- The existing project daemon (Rust shim → Bun process with Unix socket) is a proto **FsWorkspaceChildProvider**. It spawns one Bun process per workspace that stays alive for fast access (autocomplete, warm runtimes)
- There is **no** Fs installation provider today — all installations run in-process within the workspace daemon
- The existing `InstallationRuntimeImpl.create()` is a proto **InProcessInstallationChildProvider**

### 7.5 Fs workspace provider — why it's day one

The Fs workspace provider is what the current daemon model already does: a long-lived Bun process per workspace, reachable via Unix socket. This provides:

- **Fast access**: no startup cost for subsequent commands — the workspace is already warm
- **Shell completion**: autocomplete hits the warm daemon via socket, gets sub-millisecond responses
- **Runtime caching**: installation runtimes stay initialized between commands
- **Isolation**: workspace crashes don't affect the CLI or other workspaces

The daemon is just an FsWorkspaceChildProvider that the global level uses. Reframing it this way makes the current architecture a natural instance of the provider model.

### 7.6 InProcess provider — keeping the model uniform

The InProcess provider exists even though it has minimal overhead. It keeps the model uniform: every child is obtained from a provider, regardless of whether it runs in-process or in a separate process. This means:

- Code that manages children never special-cases "in-process vs. real process"
- Testing uses InProcess providers for everything — no process spawning, deterministic
- The in-process path and the out-of-process path exercise the same Supervisor/NodeHandle abstractions
- Migrating a child from in-process to Fs or Docker is a configuration change, not a code change

---

## 8. Lifecycle & Health

### 8.1 Lifecycle is always required

Every child exposes `start()`, `stop()`, and `health()` — regardless of deployment type. The implementation varies, but the interface is uniform.

| Provisioning | start() | stop() | health() |
|---|---|---|---|
| Local process (FsChildProvider) | spawn Bun process | SIGTERM | PID liveness check |
| Docker (DockerChildProvider) | docker start | docker stop | container status API |
| Remote (RemoteChildProvider) | send start command over transport | send stop command over transport | HTTP health ping |
| In-process (InProcessChildProvider) | initialize runtime | tear down runtime | always healthy |

For remote children: the remote *server* is always alive. `start()`/`stop()` operate on the *installation within* the server — initializing connectors, opening DBs, etc. The server executes these on behalf of the installation.

If a child is catastrophically unreachable, `start()`/`stop()`/`health()` produce transport errors. This is distinct from a lifecycle error (e.g., "stop succeeded but cleanup was partial"). The return types (`StartResult`, `StopResult`, `HealthStatus`) communicate the outcome — the parent never crashes or blocks on an unreachable child.

### 8.2 Health aggregation

`Supervisor.health()` aggregates across all children. A workspace is "healthy" if all installations are healthy. It's "degraded" if some are unhealthy. It's "unhealthy" if none are reachable. The aggregation strategy is configurable but the default is straightforward.

### 8.3 Lifecycle ordering

The existing `LifecycleManager` pattern (dependency-ordered start, reverse-ordered stop) applies within each node. Across nodes, the parent starts its children (via their providers) as part of its own startup, and stops them during shutdown.

---

## 9. Current Codebase Mapping

What exists today and what it corresponds to in this spec.

| This spec | Current codebase | Notes |
|---|---|---|
| GlobalMax | CLI class + GlobalConfig | Implicit — no formal abstraction. CLI plays the global role |
| WorkspaceMax | MaxProjectApp | Proto-workspace. Holds Map\<InstallationId, Runtime\>. No Supervisor abstraction |
| InstallationMax | InstallationRuntimeImpl | Proto-installation. Composition root wires SQLite components |
| Supervisor | (none) | Not yet abstracted. MaxProjectApp does ad-hoc supervision |
| ChildProvider | (none) | Not yet abstracted. FsProjectManager + FsProjectDaemonManager partially cover FsChildProvider |
| NodeHandle | (none) | InstallationRuntime is used directly, not through a handle |
| Scope upgrade (ScopeUpgradeable) | ScopeUpgradeable (partial) | Mechanism exists in type system. Not yet applied at runtime boundaries. No standalone ScopeBoundary abstraction — upgrade is called by the parent, cascade is handled by the types |
| Transport (internal to providers) | Unix socket server (partial) | Exists for CLI→daemon. Not a public abstraction — will be encapsulated inside provider packages |
| Engine\<TScope\> | Engine (unparameterized) | Interface exists. Not scope-parameterized. Only SqliteEngine impl |
| WorkspaceProtocol | MaxProjectApp methods | Ad-hoc. No formal protocol |
| InstallationProtocol | InstallationRuntime interface | Close — has sync(), engine. Missing search, schema, onboard |
| FsWorkspaceChildProvider | ProjectDaemonManager (newly extracted) | Proto-version. Current daemon model: spawns Bun process per workspace, Unix socket, PID management |
| FsInstallationChildProvider | (none) | Not yet implemented. All installations run in-process within the workspace daemon |
| InProcessInstallationChildProvider | InstallationRuntimeImpl.create() | Proto-version. Wires SQLite components in-process |
| ProjectManager interface | ProjectManager | Installation CRUD. Migrates into ChildProvider.create/connect |
| ScopedInstallationHandle | (none) | No proxy layer. Results are LocalScope only |

---

## 10. Key Design Decisions

Summary of decisions made during this design and their rationale.

### 10.1 Exactly three levels, not recursive

**Decision**: Global, Workspace, Installation — fixed, not a generic recursive tree.

**Rationale**: Infinite recursion adds complexity (tree-walking for errors, health, queries) without clear value. The segmentation use case (large installation wanting to subdivide) is better modeled as multiple installations under one workspace. Three levels covers all known scenarios.

### 10.2 Naming: Global / Workspace / Installation

**Decision**: Rename "project" to "workspace."

**Rationale**: "Project" implies a filesystem directory. Workspaces can be local or remote — the name shouldn't assume a deployment model.

### 10.3 Handle-based installation access (option a)

**Decision**: `workspace.get(installationId)` returns a scope-upgrading proxy with the full InstallationProtocol.

**Rationale**: Avoids method duplication (option b) and artificial restrictions (option c). Keeps workspace's own surface clean. Proxy handles scope upgrade transparently.

### 10.4 Identity assigned by parent, not self-known

**Decision**: Children don't know their parent-assigned IDs. The parent stamps identity during scope upgrade.

**Rationale**: Makes children portable — the same installation can be bound into multiple workspaces with different IDs. Follows the container orchestration model (containers don't know their service name).

### 10.5 ChildProvider as pluggable deployment strategy

**Decision**: ChildProviders are registered by target type, not hardcoded. Each provider is both factory and type-specific supervision delegate. Named with `ChildProvider` suffix (e.g., `FsChildProvider`) to disambiguate from other "provider" concepts.

**Rationale**: Adding a new deployment type (Docker, cloud) shouldn't require modifying the workspace or its Supervisor. Providers encapsulate deployment-specific concerns (PID files, HTTP pings, container APIs). Supervisor and ChildProvider are peers coordinated by the level-specific orchestrator — neither knows about the other.

### 10.6 Scope upgrade: parent initiates, thing cascades

**Decision**: No standalone ScopeBoundary abstraction. The parent initiates scope upgrade by calling `thing.upgrade(scopeContext)`. The thing itself cascades the upgrade through its internal structure via `ScopeUpgradeable`.

**Rationale**: The child cannot upgrade itself — it doesn't know its parent-assigned identity. But only the thing knows its internal structure (which sub-fields are also upgradeable). So the parent decides *when* to upgrade, the thing decides *how* to cascade. This avoids both a leaky abstraction (external code knowing internal field structure) and an impossible self-upgrade (child knowing parent-assigned identity).

### 10.7 Lifecycle is required, not optional

**Decision**: All children expose `start()`, `stop()`, and `health()`. No optional lifecycle.

**Rationale**: Even remote installations have meaningful start/stop semantics — the remote server executes these on behalf of the installation (initialize connectors, open DB, etc.). The server itself is always alive; the installation lifecycle is about the installation's own initialization and teardown within the server. Unreachable children produce transport errors, which is distinct from lifecycle errors. Making lifecycle optional would create two code paths everywhere a parent manages children.

### 10.8 Provider packages are deployment-strategy-scoped, not level-scoped

**Decision**: Each provider package (`@max/provider-fs`, `@max/provider-docker`, etc.) encapsulates one deployment strategy and exports ChildProviders for multiple levels (installation, workspace). Packages are not per-level.

**Rationale**: The deployment mechanics (process spawn, container lifecycle, HTTP health) are identical regardless of what level is running inside. A `@max/provider-docker` package shares Docker supervision logic between its installation and workspace providers. Splitting by level would duplicate deployment mechanics across packages. Splitting by strategy keeps deployment concerns cohesive and level concerns separate.

### 10.9 Engine parameterized by scope

**Decision**: Engine\<TScope\> — same interface, scope determines routing behavior.

**Rationale**: Enables transparent fan-out at workspace level and transparent replacement with heavier implementations (caching, materialized views) later. Consumers write against Engine regardless of scope.

### 10.10 Design clean, migrate later

**Decision**: This spec describes the target architecture. Migration from the current codebase is a separate concern.

**Rationale**: The current codebase has proto-versions of most concepts. Migration is straightforward but shouldn't constrain the target design.
