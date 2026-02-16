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

Scope tracks how much contextual identity an entity carries. As data crosses level boundaries, scope widens.

### 2.1 Scope types

| Scope | Carries | Produced by |
|---|---|---|
| LocalScope | nothing beyond entity's own ref | Installation |
| WorkspaceScope | + InstallationId | Workspace (stamps on data from installations) |
| GlobalScope | + WorkspaceId + InstallationId | Global (stamps on data from workspaces) |

### 2.2 Flow direction

```
Identity flows DOWN (parent assigns IDs to children)
Data flows UP (child produces, parent scope-upgrades)
```

- A workspace assigns an InstallationId to each child. The installation never knows this ID.
- When the workspace pulls data from an installation, it stamps the InstallationId onto every entity result, upgrading `EntityResult<E, LocalScope>` → `EntityResult<E, WorkspaceScope>`.
- Same pattern at the Global→Workspace boundary.

### 2.3 Child portability

Because children don't know their parent-assigned identity, they are portable. The same physical installation process can be bound into two different workspaces with different InstallationIds. Identity is the parent's concern, not the child's.

### 2.4 Scope in the type system

The existing `Ref<E, S>` and scope polymorphism already model this. `ScopeUpgradeable` is the mechanism for boundary crossing. Future work: `EntityResult<E, S>` will carry scope through results, not just refs.

---

## 3. Infrastructure Abstractions

These are level-agnostic. They provide the uniform operational surface that every boundary shares.

### 3.1 Supervised

The contract a child exposes to its parent. Minimal — intentionally thin.

```
Supervised {
  health(): HealthStatus
  lifecycle?: { start(), stop() }     // optional — remote children may not support
}
```

Lifecycle is optional because a parent that was *pointed at* a remote child (rather than having created it) cannot reliably start or stop it. It can still health-check it and report it as unreachable.

### 3.2 Transport

Uniform message passing. Implementation-agnostic.

```
Transport {
  send(message): Promise<response>
}
```

Implementations: InProcessTransport (method calls), UnixSocketTransport (local daemon), HttpTransport (remote), DockerTransport (container), etc.

The message type varies by level (see Protocol Surfaces below), but the mechanism is always Transport. This is what makes deployment topology invisible to the protocol layer.

### 3.3 ChildHandle\<R\>

A parent's view of one managed child. Opaque — encapsulates deployment details.

```
ChildHandle<R> {
  id: ParentAssignedId           // InstallationId or WorkspaceId
  supervised: Supervised         // health + optional lifecycle
  transport: Transport           // message passing to this child
}
```

The parent works exclusively with ChildHandles. It never sees the child's internal implementation. Whether the child is in-process, a local process, or a remote server — the handle looks the same.

### 3.4 ChildProvider\<R\>

Factory + type-specific supervisor for one deployment strategy. Each provider knows how to create or connect to children of one hosting type, and how to supervise them using type-appropriate mechanisms.

```
ChildProvider<R> {
  create(config): ChildHandle<R>       // spawn a new child
  connect(location): ChildHandle<R>    // bind to an existing child
  list(): ChildHandle<R>[]             // children this provider manages
}
```

Examples:
- **FsProvider** — spawns local Bun processes, supervises via PID files, communicates via Unix sockets
- **RemoteProvider** — connects to a URL, supervises via HTTP health checks, communicates via HTTP
- **DockerProvider** — spawns containers, supervises via Docker API, communicates via mapped ports
- **InProcessProvider** — instantiates in same process, no transport overhead (current default)

Providers are **pluggable** — the parent registers providers by target type. Adding a new deployment strategy (e.g., DockerProvider) doesn't require modifying the parent.

### 3.5 Supervisor\<R extends Supervised\>

Aggregates across ChildProviders. Provides a unified view of all children regardless of hosting type.

```
Supervisor<R extends Supervised> {
  register(handle: ChildHandle<R>): void
  unregister(id): void
  get(id): ChildHandle<R>
  list(): ChildHandle<R>[]
  health(): AggregatedHealthStatus    // delegates to each child
}
```

A workspace with 2 local installations and 1 remote installation has one Supervisor that aggregates across an FsProvider (2 handles) and a RemoteProvider (1 handle). `list()` returns all 3. `health()` checks all 3.

The Supervisor does **not** know about deployment details. It works purely with ChildHandles.

### 3.6 ScopeBoundary

Transforms data as it crosses from child to parent. The scope-upgrading proxy.

```
ScopeBoundary<ChildScope, ParentScope> {
  upgrade(result: EntityResult<E, ChildScope>, childId): EntityResult<E, ParentScope>
}
```

- At the Workspace→Installation boundary: stamps InstallationId, LocalScope → WorkspaceScope
- At the Global→Workspace boundary: stamps WorkspaceId, WorkspaceScope → GlobalScope

The ScopeBoundary lives at the **parent side** — because the parent holds the identity it assigned to the child. The child cannot upgrade itself (it doesn't know its own parent-assigned ID).

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

The workspace constructs this proxy by wrapping the raw ChildHandle with the ScopeBoundary and the assigned InstallationId. The caller never sees LocalScope entities — scope upgrade is transparent.

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
  + ScopeBoundary<WorkspaceScope, GlobalScope>
  + Engine<GlobalScope>
  + ChildProviders for workspaces

WorkspaceMax
  = Supervisor<InstallationHandle>
  + WorkspaceProtocol
  + ScopeBoundary<LocalScope, WorkspaceScope>
  + Engine<WorkspaceScope>
  + ChildProviders for installations: [FsProvider, RemoteProvider, InProcessProvider, ...]

InstallationMax
  = InstallationProtocol
  + Engine<LocalScope>
  + SyncExecutor + ConnectorContext + TaskStore + SyncMeta
  (leaf — no Supervisor, no ScopeBoundary, no ChildProviders)
```

---

## 7. Lifecycle & Health

### 7.1 Asymmetric lifecycle control

A parent's control over a child depends on how the child was provisioned:

| Provisioning | start | stop | health | restart |
|---|---|---|---|---|
| Parent created (local process) | yes | yes | yes | yes (stop + start) |
| Parent created (Docker) | yes | yes | yes | yes (container restart) |
| Parent pointed at (remote) | no | best-effort (send shutdown request) | yes (HTTP ping) | no |
| In-process | implicit | yes | always healthy | re-instantiate |

The parent does its best. If a remote child is unreachable, the parent reports it as unhealthy — it doesn't crash or block.

### 7.2 Health aggregation

`Supervisor.health()` aggregates across all children. A workspace is "healthy" if all installations are healthy. It's "degraded" if some are unhealthy. It's "unhealthy" if none are reachable. The aggregation strategy is configurable but the default is straightforward.

### 7.3 Lifecycle ordering

The existing `LifecycleManager` pattern (dependency-ordered start, reverse-ordered stop) applies within each node. Across nodes, the parent starts its children (via their providers) as part of its own startup, and stops them during shutdown.

---

## 8. Current Codebase Mapping

What exists today and what it corresponds to in this spec.

| This spec | Current codebase | Notes |
|---|---|---|
| GlobalMax | CLI class + GlobalConfig | Implicit — no formal abstraction. CLI plays the global role |
| WorkspaceMax | MaxProjectApp | Proto-workspace. Holds Map\<InstallationId, Runtime\>. No Supervisor abstraction |
| InstallationMax | InstallationRuntimeImpl | Proto-installation. Composition root wires SQLite components |
| Supervisor | (none) | Not yet abstracted. MaxProjectApp does ad-hoc supervision |
| ChildProvider | (none) | Not yet abstracted. FsProjectManager + FsProjectDaemonManager partially cover FsProvider |
| ChildHandle | (none) | InstallationRuntime is used directly, not through a handle |
| ScopeBoundary | ScopeUpgradeable (partial) | Mechanism exists in type system. Not applied at runtime boundaries |
| Transport | Unix socket server (partial) | Exists for CLI→daemon. Not generalized |
| Engine\<TScope\> | Engine (unparameterized) | Interface exists. Not scope-parameterized. Only SqliteEngine impl |
| WorkspaceProtocol | MaxProjectApp methods | Ad-hoc. No formal protocol |
| InstallationProtocol | InstallationRuntime interface | Close — has sync(), engine. Missing search, schema, onboard |
| FsProvider | FsProjectManager + FsProjectDaemonManager | Split across two classes. Covers creation, lifecycle, credential storage |
| ProjectManager interface | ProjectManager | Installation CRUD. Migrates into ChildProvider.create/connect |
| ProjectDaemonManager interface | ProjectDaemonManager (newly extracted) | Daemon lifecycle. Migrates into FsProvider supervision |
| ScopedInstallationHandle | (none) | No proxy layer. Results are LocalScope only |

---

## 9. Key Design Decisions

Summary of decisions made during this design and their rationale.

### 9.1 Exactly three levels, not recursive

**Decision**: Global, Workspace, Installation — fixed, not a generic recursive tree.

**Rationale**: Infinite recursion adds complexity (tree-walking for errors, health, queries) without clear value. The segmentation use case (large installation wanting to subdivide) is better modeled as multiple installations under one workspace. Three levels covers all known scenarios.

### 9.2 Naming: Global / Workspace / Installation

**Decision**: Rename "project" to "workspace."

**Rationale**: "Project" implies a filesystem directory. Workspaces can be local or remote — the name shouldn't assume a deployment model.

### 9.3 Handle-based installation access (option a)

**Decision**: `workspace.get(installationId)` returns a scope-upgrading proxy with the full InstallationProtocol.

**Rationale**: Avoids method duplication (option b) and artificial restrictions (option c). Keeps workspace's own surface clean. Proxy handles scope upgrade transparently.

### 9.4 Identity assigned by parent, not self-known

**Decision**: Children don't know their parent-assigned IDs. The parent stamps identity during scope upgrade.

**Rationale**: Makes children portable — the same installation can be bound into multiple workspaces with different IDs. Follows the container orchestration model (containers don't know their service name).

### 9.5 ChildProvider as pluggable deployment strategy

**Decision**: Providers are registered by target type, not hardcoded. Each provider is both factory and type-specific supervisor.

**Rationale**: Adding a new deployment type (Docker, cloud) shouldn't require modifying the workspace or its Supervisor. Providers encapsulate deployment-specific concerns (PID files, HTTP pings, container APIs).

### 9.6 Scope upgrade at the parent side

**Decision**: ScopeBoundary lives at the parent, not the child.

**Rationale**: The child cannot upgrade itself — it doesn't know its parent-assigned identity. Two installations on different machines connecting to the same SaaS have no globally unique installation ID. Only the parent can assign and stamp.

### 9.7 Engine parameterized by scope

**Decision**: Engine\<TScope\> — same interface, scope determines routing behavior.

**Rationale**: Enables transparent fan-out at workspace level and transparent replacement with heavier implementations (caching, materialized views) later. Consumers write against Engine regardless of scope.

### 9.8 Design clean, migrate later

**Decision**: This spec describes the target architecture. Migration from the current codebase is a separate concern.

**Rationale**: The current codebase has proto-versions of most concepts. Migration is straightforward but shouldn't constrain the target design.
