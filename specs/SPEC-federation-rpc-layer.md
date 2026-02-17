# SPEC: Federation RPC Layer

> Authored: 2026-02-17. Companion to SPEC-federated-architecture.md and addendum-1.
> Status: Design complete. Replaces the spike on branch `federation--rpc--mess`.

## Overview

This spec defines how typed method calls cross process boundaries in the federation architecture. It covers the wire protocol, the proxy+handler pattern, node dispatchers, scope-aware routing, transport lifecycle, and error propagation.

**Scope**: Everything between a caller invoking `client.engine.query(...)` and the real `Engine.query()` executing inside a remote process. Does not cover fan-out engines, scope upgrade mechanics, or provider-specific process management (those are covered by the parent specs).

### Design principles

1. **Typed boundaries, untyped wire.** Proxies (caller-side) and handlers (receiver-side) are fully typed. The wire between them is JSON. Type safety lives at the edges, not in the transport.
2. **Paired proxy+handler per interface.** Each interface that crosses a wire has a proxy and a handler, co-located in the same package. They are mirrors — adding a method to one means adding it to the other.
3. **No generic dispatch.** No string-registered method allowlists. Each handler is a concrete class with a switch/map over known methods. The compiler catches missing proxy methods; roundtrip tests catch missing handler methods.
4. **Scope-aware routing.** Requests flowing down the hierarchy carry scope context (the mirror of scope upgrade for data flowing up). Scope context is structured data on the request, accumulated at transport boundaries and stripped at dispatch boundaries — never string prefixes.
5. **Each transport is to one node.** A transport connects a caller to a single node. Cross-node routing (workspace to installation) is the dispatching node's concern, not the transport's.
6. **Persistent connections.** One socket connection per node, multiplexed with request IDs. Not connection-per-call.
7. **MaxError fidelity.** Errors cross the wire with boundary, facets, and structured data intact. Serialization/deserialization lives in `@max/core` alongside `MaxError`.
8. **Dumb handles.** Rich return values (like SyncHandle) cross the wire as data. Subsequent operations route as regular method calls with the handle ID as an argument — no server-side session routing.

---

## 1. Named Handle Types

Used throughout the codebase instead of repeating the generic form:

```ts
// @max/app — alongside client definitions
type InstallationHandle = NodeHandle<InstallationClient, InstallationId>
type WorkspaceHandle = NodeHandle<WorkspaceClient, WorkspaceId>
```

Every place that currently writes `NodeHandle<InstallationClient, InstallationId>` uses `InstallationHandle` instead.

---

## 2. Wire Protocol

### 2.1 RpcRequest

```ts
interface RpcRequest {
  /** Unique ID for response matching (persistent connection multiplexing). */
  readonly id: string

  /**
   * Sub-object within the node:
   *   ""        → root (Supervised methods + protocol-specific: sync, schema)
   *   "engine"  → the node's Engine
   *
   * Flat string. Never a dotted path. Never a compound routing expression.
   * Identifies a sub-object within ONE node — cross-node routing is in `scope`.
   */
  readonly target: string

  /** Method name on the target object. */
  readonly method: string

  /** Serialized arguments, positional. */
  readonly args: readonly unknown[]

  /**
   * Scope routing context.
   *
   * Mirrors the scope system: scope upgrade stamps identity on data flowing UP;
   * scope routing identifies which child to reach for requests flowing DOWN.
   *
   * Accumulated at transport boundaries (ScopedTransport adds its level's context).
   * Stripped at dispatch boundaries (each dispatcher consumes its level's context
   * and forwards the rest).
   *
   * Absent when talking directly to a node (no routing needed).
   */
  readonly scope?: ScopeRouting
}

/**
 * Routing context for requests flowing down the hierarchy.
 *
 * Each field corresponds to one level in the federation.
 * A request from Global → Workspace → Installation accumulates both fields.
 * Each dispatcher strips its own field and forwards the rest.
 */
interface ScopeRouting {
  readonly workspaceId?: WorkspaceId
  readonly installationId?: InstallationId
}
```

### 2.2 RpcResponse

```ts
type RpcResponse =
  | { readonly id: string; readonly ok: true; readonly result: unknown }
  | { readonly id: string; readonly ok: false; readonly error: SerializedError }

// Companion object — factory methods
const RpcResponse = {
  ok(id: string, result: unknown): RpcResponse {
    return { id, ok: true, result }
  },
  error(id: string, error: SerializedError): RpcResponse {
    return { id, ok: false, error }
  },
}
```

### 2.3 SerializedError

MaxErrors cross the wire with structure preserved:

```ts
interface SerializedError {
  readonly message: string
  readonly code?: string                       // e.g. "subprocess.node_unreachable"
  readonly boundary?: string                   // MaxError boundary name
  readonly facets?: string[]                   // Facet marker names: ["NotFound", "BadInput"]
  readonly data?: Record<string, unknown>      // Facet data (HasEntityRef fields, etc.)
  readonly cause?: SerializedError             // Wrapped error chain
}
```

On the receiver side: `MaxError` instances are serialized via `MaxError.serialize()`. On the caller side: `SerializedError` is reconstituted via `MaxError.reconstitute()`, producing a `MaxError` with the same boundary, facets, and data. This means `MaxError.has(err, NotFound)` and `SomeBoundary.is(err)` work across process boundaries.

Both `MaxError.serialize()` and `MaxError.reconstitute()` live in `@max/core` alongside the `MaxError` implementation.

### 2.4 Transport interface

```ts
interface Transport {
  send(request: RpcRequest): Promise<unknown>
  close(): Promise<void>
}
```

`send` takes a typed `RpcRequest` (not `unknown`). The transport reads the `id` field for response matching but does NOT interpret the request contents (target, method, args, scope). It is a dumb pipe that happens to know the envelope shape.

`close()` tears down the persistent connection.

---

## 3. Proxy + Handler Pattern

Each interface that crosses a process boundary has a **paired proxy and handler**. They are co-located with the interface they represent.

### 3.1 Proxy (caller-side)

The proxy implements the typed interface, converting method calls to `RpcRequest` messages:

```ts
// @max/core — co-located with Engine
class EngineProxy<TScope extends Scope> implements Engine<TScope> {
  lifecycle = LifecycleManager.on({})  // no-op — host node's concern

  constructor(private readonly transport: Transport, private readonly target = "engine") {}

  async query(query: EntityQuery<any, any>): Promise<Page<any>> {
    return this.rpc("query", query)
  }

  async load(ref: Ref<any>, fields: unknown): Promise<any> {
    return this.rpc("load", ref, fields)
  }

  // ... one method per Engine method

  private rpc(method: string, ...args: unknown[]): Promise<any> {
    const request: RpcRequest = { id: generateId(), target: this.target, method, args }
    return this.transport.send(request)
  }
}
```

### 3.2 Handler (receiver-side)

The handler is the proxy's mirror. It receives a method name and args, and calls the real implementation:

```ts
// @max/core — co-located with Engine and EngineProxy
class EngineHandler<TScope extends Scope> {
  constructor(private readonly engine: Engine<TScope>) {}

  dispatch(method: string, args: readonly unknown[]): Promise<unknown> {
    switch (method) {
      case "load":           return this.engine.load(args[0] as Ref<any>, args[1] as any)
      case "loadField":      return this.engine.loadField(args[0] as Ref<any>, args[1] as any)
      case "loadCollection": return this.engine.loadCollection(args[0] as Ref<any>, args[1] as any, args[2] as any)
      case "store":          return this.engine.store(args[0] as EntityInput<any>)
      case "loadPage":       return this.engine.loadPage(args[0] as any, args[1] as any, args[2] as any)
      case "query":          return this.engine.query(args[0] as EntityQuery<any, any>)
      default: throw ErrUnknownMethod.create({ target: "engine", method })
    }
  }
}
```

The `as` casts on args are unavoidable — they're deserialized from JSON. Type safety is enforced at the proxy boundary (the proxy implements `Engine<TScope>` and the compiler checks it). The handler trusts the proxy to send correctly-shaped args.

### 3.3 Co-location rule

| Interface | Proxy | Handler | Package |
|---|---|---|---|
| Supervised | SupervisedProxy | SupervisedHandler | @max/core |
| Engine\<TScope\> | EngineProxy\<TScope\> | EngineHandler\<TScope\> | @max/core |

Adding a method to Engine requires updating:
1. `Engine` interface — compiler error if proxy doesn't implement it
2. `EngineProxy` — add the method (to satisfy the interface)
3. `EngineHandler` — add the case (caught by roundtrip test)

All three are in the same package. No provider package changes needed.

SyncHandle does NOT have a proxy+handler pair — see section 6 (Dumb SyncHandle).

### 3.4 Roundtrip test contract

Each proxy+handler pair has a roundtrip test:

```ts
test("every Engine method round-trips through proxy → handler", async () => {
  const real = createFakeEngine()
  const handler = new EngineHandler(real)
  const transport = createLoopbackTransport(handler)
  const proxy = new EngineProxy(transport)

  // Exercise every method
  await proxy.query({ def: TestEntity, filters: [], projection: { kind: "all" } })
  expect(real.queryCalled).toBe(true)

  await proxy.load(testRef, "*")
  expect(real.loadCalled).toBe(true)

  // ... every method
})
```

This test catches handler drift — if you add a method to the proxy but forget the handler case, the test fails.

---

## 4. Node Dispatchers

A dispatcher composes handlers for one node type. It is the entry point for all RPC calls to that node.

### 4.1 InstallationDispatcher

```ts
// @max/app — knows about InstallationClient composition
class InstallationDispatcher {
  private readonly supervised: SupervisedHandler
  private readonly engine: EngineHandler<InstallationScope>
  private readonly syncHandles = new Map<SyncId, SyncHandle>()

  constructor(private readonly node: InstallationClient) {
    this.supervised = new SupervisedHandler(node)
    this.engine = new EngineHandler(node.engine)
  }

  async dispatch(request: RpcRequest): Promise<RpcResponse> {
    try {
      const result = await this.route(request)
      return RpcResponse.ok(request.id, result)
    } catch (err) {
      return RpcResponse.error(request.id, MaxError.serialize(err))
    }
  }

  private route(request: RpcRequest): Promise<unknown> {
    const { target, method, args } = request

    switch (target) {
      case "":       return this.dispatchRoot(method, args)
      case "engine": return this.engine.dispatch(method, args)
      default:       throw ErrUnknownTarget.create({ target })
    }
  }

  private dispatchRoot(method: string, args: readonly unknown[]): Promise<unknown> {
    switch (method) {
      // Supervised
      case "health":
      case "start":
      case "stop":
        return this.supervised.dispatch(method, args)

      // Schema (property access)
      case "schema":
        return Promise.resolve(this.node.schema)

      // Sync — returns handle data, registers server-side handle
      case "sync":
        return this.startSync()

      // Sync handle operations — syncId is the first argument
      case "syncStatus":
      case "syncPause":
      case "syncCancel":
      case "syncCompletion":
        return this.dispatchSyncMethod(method, args)

      default:
        throw ErrUnknownMethod.create({ target: "root", method })
    }
  }

  private async startSync(): Promise<unknown> {
    const handle = await this.node.sync()
    this.syncHandles.set(handle.id, handle)
    return {
      id: handle.id,
      plan: handle.plan,
      startedAt: handle.startedAt.toISOString(),
    }
  }

  private dispatchSyncMethod(method: string, args: readonly unknown[]): Promise<unknown> {
    const syncId = args[0] as SyncId
    const handle = this.syncHandles.get(syncId)
    if (!handle) throw ErrSyncHandleNotFound.create({ syncId })

    switch (method) {
      case "syncStatus":     return handle.status()
      case "syncPause":      return handle.pause()
      case "syncCancel":     return handle.cancel().then(() => { this.syncHandles.delete(syncId) })
      case "syncCompletion": return handle.completion().then(r => { this.syncHandles.delete(syncId); return r })
      default:               throw ErrUnknownMethod.create({ target: "sync", method })
    }
  }
}
```

The dispatcher takes `InstallationClient` directly — fully typed. No string-based method registration. Sync handle operations are regular root methods with `syncId` as the first argument (see section 6).

### 4.2 WorkspaceDispatcher

```ts
// @max/app — knows about WorkspaceClient composition
class WorkspaceDispatcher {
  private readonly supervised: SupervisedHandler

  // Cache dispatchers for installations to avoid reconstruction
  private readonly installationDispatchers = new Map<InstallationId, InstallationDispatcher>()

  constructor(private readonly node: WorkspaceClient) {
    this.supervised = new SupervisedHandler(node)
  }

  async dispatch(request: RpcRequest): Promise<RpcResponse> {
    try {
      const result = await this.route(request)
      return RpcResponse.ok(request.id, result)
    } catch (err) {
      return RpcResponse.error(request.id, MaxError.serialize(err))
    }
  }

  private route(request: RpcRequest): Promise<unknown> {
    // Scope routing: if installationId is present, route to that installation
    if (request.scope?.installationId) {
      return this.routeToInstallation(request)
    }

    const { target, method, args } = request

    switch (target) {
      case "": return this.dispatchRoot(method, args)
      default: throw ErrUnknownTarget.create({ target })
    }
  }

  private dispatchRoot(method: string, args: readonly unknown[]): Promise<unknown> {
    switch (method) {
      // Supervised
      case "health":
      case "start":
      case "stop":
        return this.supervised.dispatch(method, args)

      // Workspace query operations
      case "listInstallations":
        return this.node.listInstallations()

      // Workspace mutation operations (intent-based, serializable args)
      case "createInstallation":
        return this.node.createInstallation(args[0] as CreateInstallationConfig)

      case "removeInstallation":
        return this.node.removeInstallation(args[0] as InstallationId)

      default:
        throw ErrUnknownMethod.create({ target: "root", method })
    }
  }

  private async routeToInstallation(request: RpcRequest): Promise<unknown> {
    const installationId = request.scope!.installationId!
    const inst = this.node.installation(installationId)
    if (!inst) throw ErrNodeNotFound.create({ id: installationId })

    // Strip installationId from scope and dispatch as if talking directly to the installation
    const innerRequest: RpcRequest = {
      ...request,
      scope: { ...request.scope, installationId: undefined },
    }

    // Reuse or create an InstallationDispatcher for this installation
    let dispatcher = this.installationDispatchers.get(installationId)
    if (!dispatcher) {
      dispatcher = new InstallationDispatcher(inst)
      this.installationDispatchers.set(installationId, dispatcher)
    }

    const response = await dispatcher.dispatch(innerRequest)

    // Unwrap — we're already inside a try/catch at this level
    if (response.ok) return response.result
    throw MaxError.reconstitute(response.error)
  }
}
```

Installation routing reads `request.scope.installationId` (structured data), strips it, and delegates to a composed `InstallationDispatcher`. The same pattern extends to GlobalDispatcher reading `request.scope.workspaceId`.

### 4.3 Pattern: scope stripping at each level

Each dispatcher consumes its scope field and forwards the rest. This mirrors scope upgrade (which adds identity going up):

```
Request flowing DOWN (routing):
  Global dispatcher:    reads scope.workspaceId → strips it → forwards to workspace
  Workspace dispatcher: reads scope.installationId → strips it → forwards to installation
  Installation dispatcher: no scope left → handles directly

Data flowing UP (scope upgrade):
  Installation: produces LocalScope data
  Workspace:    stamps installationId → WorkspaceScope
  Global:       stamps workspaceId → GlobalScope
```

The symmetry is intentional. Downward routing and upward scope upgrade are inverses.

---

## 5. Supervisor Is Internal; Client Has Explicit Methods

### 5.1 The tension

`Supervisor<R, TId>` has five operations: `get`, `list`, `health`, `register`, `unregister`. The last two cannot work over RPC — `register` takes a live `NodeHandle` (in-memory object with a socket-backed client), and `unregister` is a local tracking mutation.

But the real problem is deeper: **`register(handle)` and "create a new installation" are fundamentally different operations**. They look similar but operate at different abstraction levels:

| What the caller means | What Supervisor.register does |
|---|---|
| "Create and supervise a new installation from this config" | "Here is a live in-memory NodeHandle, add it to your tracking list" |
| "Tear down installation X" | "Remove this ID from your tracking list" |

The caller has intent and config. The Supervisor operates on live objects. We conflated them because they look similar, but they are different operations at different layers.

### 5.2 The fix

Supervisor stays **private to the orchestrator**. The client has **explicit methods** for its actual API surface:

```ts
interface WorkspaceClient extends Supervised {
  // Query
  listInstallations(): Promise<InstallationInfo[]>
  installation(id: InstallationId): InstallationClient | undefined

  // Mutate (intent-based, serializable config — not live handles)
  createInstallation(config: CreateInstallationConfig): Promise<InstallationId>
  removeInstallation(id: InstallationId): Promise<void>
}
```

Every method works identically in-process and over RPC. `createInstallation` takes serializable config, not a live handle. `removeInstallation` takes an ID, not a tracking-list mutation.

Internally, `WorkspaceMax` still uses a `Supervisor` — that's where handle registration happens after the NodeProvider does its work:

```ts
class WorkspaceMax implements WorkspaceClient {
  private supervisor: Supervisor<InstallationClient, InstallationId>

  async createInstallation(config: CreateInstallationConfig): Promise<InstallationId> {
    const handle = await this.provider.create(config)
    this.supervisor.register(handle)  // internal wiring
    return handle.id
  }

  async removeInstallation(id: InstallationId): Promise<void> {
    const handle = this.supervisor.get(id)
    if (handle) await handle.client.stop()
    this.supervisor.unregister(id)    // internal wiring
    // + process cleanup via provider
  }

  installation(id: InstallationId): InstallationClient | undefined {
    return this.supervisor.get(id)?.client
  }

  async listInstallations(): Promise<InstallationInfo[]> {
    return this.supervisor.list().map(h => ({
      id: h.id,
      providerKind: h.providerKind,
    }))
  }
}
```

No `SupervisorView` type is needed. The read-only supervision surface (list, get, health) is three methods — if `GlobalClient` needs the same pattern, it will have `listWorkspaces()`, `workspace(id)`, etc. with different types. Extract a shared type only if it emerges naturally across multiple clients later.

---

## 6. Dumb SyncHandle

### 6.1 The problem with smart handles over RPC

The spike treats SyncHandle as a **separate RPC target** — a stateful server-side session with its own routing convention (`sync:{id}` prefix, `syncId` field on RpcRequest, `syncHandles` map as a dispatch concern, session cleanup logic). This adds significant machinery to the transport and dispatch layers for one interface.

### 6.2 The simplification

SyncHandle crosses the wire as **data**. Subsequent operations are **regular root-target method calls** with the sync ID as an argument. No separate target, no separate proxy+handler pair, no routing concern.

**Over the wire:**
```
sync()           → { target: "", method: "sync",           args: [] }           → returns { id, plan, startedAt }
status(syncId)   → { target: "", method: "syncStatus",     args: [syncId] }     → returns SyncStatus
pause(syncId)    → { target: "", method: "syncPause",      args: [syncId] }     → returns void
cancel(syncId)   → { target: "", method: "syncCancel",     args: [syncId] }     → returns void
completion(syncId)→ { target: "", method: "syncCompletion", args: [syncId] }     → returns SyncResult
```

**Caller side — DX unchanged:**
```ts
const handle = await client.sync()   // returns a SyncHandle
await handle.status()                // internally: rpc("syncStatus", handle.id)
await handle.completion()            // internally: rpc("syncCompletion", handle.id)
```

The local SyncHandle (in-process) is unchanged — closures over executor state. The remote SyncHandle is a thin wrapper:

```ts
class RemoteSyncHandle implements SyncHandle {
  readonly id: SyncId
  readonly plan: SyncPlan
  readonly startedAt: Date

  constructor(
    private readonly transport: Transport,
    info: { id: SyncId; plan: SyncPlan; startedAt: string },
  ) {
    this.id = info.id
    this.plan = info.plan
    this.startedAt = new Date(info.startedAt)
  }

  async status(): Promise<SyncStatus> {
    return this.rpc("syncStatus", this.id)
  }

  async pause(): Promise<void> {
    return this.rpc("syncPause", this.id)
  }

  async cancel(): Promise<void> {
    return this.rpc("syncCancel", this.id)
  }

  async completion(): Promise<SyncResult> {
    return this.rpc("syncCompletion", this.id)
  }

  private rpc(method: string, ...args: unknown[]): Promise<any> {
    return this.transport.send({ id: generateId(), target: "", method, args })
  }
}
```

**Receiver side**: the dispatcher handles `syncStatus` etc. as regular root methods. It still tracks live handles in a `Map<SyncId, SyncHandle>` — but this is an **implementation detail of those methods**, not a routing concern. See section 4.1.

### 6.3 What this eliminates

- ~~`SyncHandleProxy`~~ → `RemoteSyncHandle` (thin wrapper, lives in `@max/app` alongside `InstallationClientProxy`)
- ~~`SyncHandleHandler`~~ → not needed (sync methods are regular root dispatches)
- ~~`syncId` on RpcRequest~~ → sync ID is a method argument
- ~~Sync handle as a separate RPC target~~ → regular root methods
- ~~Session routing in transport/dispatch layers~~ → implementation detail of the dispatcher

The co-location table (section 3.3) shrinks:

| Interface | Proxy | Handler | Package |
|---|---|---|---|
| Supervised | SupervisedProxy | SupervisedHandler | @max/core |
| Engine\<TScope\> | EngineProxy\<TScope\> | EngineHandler\<TScope\> | @max/core |

SyncHandle has no proxy+handler pair. It has a `RemoteSyncHandle` data wrapper that routes through the regular installation RPC path.

---

## 7. Client Proxies

These compose interface proxies into complete client surfaces.

### 7.1 InstallationClientProxy

```ts
// @max/app — co-located with InstallationClient
class InstallationClientProxy implements InstallationClient {
  private readonly supervised: SupervisedProxy
  readonly engine: EngineProxy<InstallationScope>
  readonly schema: Schema

  constructor(
    private readonly transport: Transport,
    opts: { schema: Schema },
  ) {
    this.supervised = new SupervisedProxy(transport)
    this.engine = new EngineProxy(transport)
    this.schema = opts.schema
  }

  health() { return this.supervised.health() }
  start() { return this.supervised.start() }
  stop()  { return this.supervised.stop() }

  async sync(): Promise<SyncHandle> {
    const request: RpcRequest = { id: generateId(), target: "", method: "sync", args: [] }
    const info = await this.transport.send(request) as { id: SyncId; plan: SyncPlan; startedAt: string }
    return new RemoteSyncHandle(this.transport, info)
  }
}
```

`schema` is a constructor parameter — the proxy is never in an invalid state. The provider fetches schema during `connect()`/`create()` before constructing the proxy.

### 7.2 WorkspaceClientProxy

```ts
// @max/app — co-located with WorkspaceClient
class WorkspaceClientProxy implements WorkspaceClient {
  private readonly supervised: SupervisedProxy

  constructor(private readonly transport: Transport) {
    this.supervised = new SupervisedProxy(transport)
  }

  health() { return this.supervised.health() }
  start() { return this.supervised.start() }
  stop()  { return this.supervised.stop() }

  // Query
  async listInstallations(): Promise<InstallationInfo[]> {
    return this.rpc("listInstallations")
  }

  installation(id: InstallationId): InstallationClient | undefined {
    // Returns a proxy routed through this workspace's transport.
    // Every request from this proxy carries scope.installationId.
    return new InstallationClientProxy(
      new ScopedTransport(this.transport, { installationId: id }),
      { schema: /* fetched lazily or cached */ },
    )
  }

  // Mutate (intent-based — serializable config, not live handles)
  async createInstallation(config: CreateInstallationConfig): Promise<InstallationId> {
    return this.rpc("createInstallation", config)
  }

  async removeInstallation(id: InstallationId): Promise<void> {
    return this.rpc("removeInstallation", id)
  }

  private rpc(method: string, ...args: unknown[]): Promise<any> {
    return this.transport.send({ id: generateId(), target: "", method, args })
  }
}
```

Every method maps directly to a workspace RPC call. No `Supervisor` interface exposed. No throwing stubs, no `as any`, no fabricated `providerKind`.

### 7.3 ScopedTransport

A scope-generic transport wrapper. Adds scope routing context to every request, mirroring how scope upgrade stamps identity on data:

```ts
class ScopedTransport implements Transport {
  constructor(
    private readonly inner: Transport,
    private readonly addScope: Partial<ScopeRouting>,
  ) {}

  async send(request: RpcRequest): Promise<unknown> {
    return this.inner.send({
      ...request,
      scope: { ...request.scope, ...this.addScope },
    })
  }

  async close(): Promise<void> {
    // No-op — inner transport lifecycle is shared
  }
}
```

Usage at each level:

```ts
// Workspace proxy → scopes to an installation
new ScopedTransport(workspaceTransport, { installationId: id })

// Global proxy → scopes to a workspace
new ScopedTransport(globalTransport, { workspaceId: id })

// Global proxy → scopes to a specific installation in a specific workspace
// (two layers of ScopedTransport, or the global proxy creates both fields)
new ScopedTransport(globalTransport, { workspaceId: wsId, installationId: instId })
```

This is one mechanism that works at every level. The scope fields are typed (`WorkspaceId`, `InstallationId`), not arbitrary strings.

---

## 8. Error Propagation

All errors in the RPC layer use `MaxError` with proper boundaries. No `throw new Error(...)`.

### 8.1 RPC boundary errors

```ts
// @max/core — federation/rpc-errors.ts
const Rpc = MaxError.boundary("rpc")

const ErrUnknownTarget = Rpc.define("unknown_target", {
  customProps: ErrFacet.props<{ target: string }>(),
  facets: [BadInput],
  message: (d) => `Unknown RPC target "${d.target}"`,
})

const ErrUnknownMethod = Rpc.define("unknown_method", {
  customProps: ErrFacet.props<{ target: string; method: string }>(),
  facets: [BadInput],
  message: (d) => `Unknown method "${d.method}" on target "${d.target}"`,
})

const ErrSyncHandleNotFound = Rpc.define("sync_handle_not_found", {
  customProps: ErrFacet.props<{ syncId: string }>(),
  facets: [NotFound],
  message: (d) => `No sync handle with id "${d.syncId}"`,
})
```

### 8.2 Serialization (receiver-side)

```ts
// @max/core — near max-error.ts
MaxError.serialize(err: unknown): SerializedError
```

Converts any error (MaxError or plain Error) into a `SerializedError`. MaxErrors preserve boundary, facets, and data. Plain errors become `{ message }`.

### 8.3 Deserialization (caller-side)

```ts
// @max/core — near max-error.ts
MaxError.reconstitute(err: SerializedError): MaxError
```

Reconstructs a `MaxError` from serialized data. The reconstituted error supports the standard catch axes:
- `MaxError.has(err, NotFound)` → `true` (if original had NotFound facet)
- `SomeBoundary.is(err)` → `true` (if original was from that boundary)
- `err.code` → `"subprocess.node_unreachable"` (preserved)

This is a new addition to the MaxError system — a factory that creates a MaxError from wire data without needing the original `ErrorDef`.

---

## 9. Transport: Persistent Connections

### 9.1 Connection model

One persistent socket connection per remote node. The connection is opened once (during `provider.connect()` or `provider.create()`) and reused for all RPC calls. Requests are multiplexed using the `id` field — multiple in-flight requests share the connection.

### 9.2 SubprocessTransportClient

```ts
class SubprocessTransportClient implements Transport {
  private socket: BunSocket | null = null
  private readonly pending = new Map<string, { resolve: Function; reject: Function }>()

  constructor(private readonly socketPath: string) {}

  async connect(): Promise<void> {
    // Open persistent connection via Bun.connect
    // Set up data handler that parses JSONL responses
    // Use Bun's native JSONL chunking (not manual string buffer) for performance
  }

  async send(request: RpcRequest): Promise<unknown> {
    if (!this.socket) throw ErrNodeUnreachable.create({ socketPath: this.socketPath })

    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject })
      this.socket!.write(JSON.stringify(request) + "\n")
    })
  }

  async close(): Promise<void> {
    this.socket?.end()
    // Reject all pending requests with ErrNodeUnreachable
    for (const [id, { reject }] of this.pending) {
      reject(ErrNodeUnreachable.create({ socketPath: this.socketPath }, "transport closed"))
    }
    this.pending.clear()
  }

  // Data handler: parse JSONL, match response.id to pending, resolve/reject
  // Use Bun's native JSONL facilities — see existing socket-server.ts for pattern
}
```

### 9.3 Socket server (subprocess side)

```ts
// @max/provider-subprocess — runs inside the spawned subprocess
function createSocketServer(
  socketPath: string,
  dispatcher: InstallationDispatcher | WorkspaceDispatcher,
): BunServer {
  return Bun.listen({
    unix: socketPath,
    socket: {
      async data(socket, raw) {
        // Parse JSONL request(s) using Bun's native facilities
        // For each: await dispatcher.dispatch(request)
        // Write JSONL response
        socket.write(JSON.stringify(response) + "\n")
      },
    },
  })
}
```

The socket server is a thin adapter between Bun's socket API and the typed dispatcher.

---

## 10. Package Structure

```
@max/core
├── src/proxies/
│   ├── engine-proxy.ts          ← from spike (add id to requests)
│   ├── engine-handler.ts        ← NEW
│   ├── supervised-proxy.ts      ← from spike (add id to requests)
│   └── supervised-handler.ts    ← NEW
├── src/federation/
│   ├── rpc.ts                   ← from spike (add id field, add SerializedError)
│   ├── rpc-errors.ts            ← NEW (ErrUnknownTarget, ErrUnknownMethod, etc.)
│   └── transport.ts             ← update: send(RpcRequest), add close()
├── src/max-error.ts             ← update: add serialize() and reconstitute()
└── exports: EngineProxy, EngineHandler, SupervisedProxy, SupervisedHandler,
             RpcRequest, RpcResponse, Transport, SerializedError, ScopeRouting

@max/execution
└── (no proxy/handler changes — SyncHandle uses RemoteSyncHandle pattern)

@max/app
├── src/protocols/
│   ├── installation-client-proxy.ts   ← transform (schema as ctor param, RemoteSyncHandle)
│   ├── workspace-client-proxy.ts      ← rewrite (ScopedTransport, explicit methods)
│   ├── workspace-client.ts            ← update (explicit methods, no Supervisor on surface)
│   ├── remote-sync-handle.ts          ← NEW (dumb handle wrapper)
│   └── scoped-transport.ts            ← NEW (scope-generic)
├── src/dispatchers/
│   ├── installation-dispatcher.ts     ← NEW
│   └── workspace-dispatcher.ts        ← NEW
├── src/federation/
│   ├── handle-types.ts                ← NEW (InstallationHandle, WorkspaceHandle aliases)
└── exports: InstallationClientProxy, WorkspaceClientProxy,
             InstallationDispatcher, WorkspaceDispatcher,
             RemoteSyncHandle, ScopedTransport,
             InstallationHandle, WorkspaceHandle

@max/provider-subprocess              (separate package, currently app/src/providers/subprocess/)
├── transport-client.ts          ← rewrite (persistent connection, Bun native JSONL)
├── socket-server.ts             ← NEW
├── process-manager.ts           ← from spike (as-is)
├── installation-provider.ts     ← transform (new transport, no ID generation)
├── workspace-provider.ts        ← transform (no workspaceIdFromRoot, new transport)
└── errors.ts                    ← from spike (as-is)
```

---

## 11. File Disposition from Spike

Spike branch: `federation--rpc--mess`

| Spike file | Disposition | Notes |
|---|---|---|
| `core/src/proxies/supervised-proxy.ts` | **Keep** | Add `id` to requests |
| `core/src/proxies/engine-proxy.ts` | **Keep** | Add `id` to requests |
| `core/src/federation/rpc.ts` | **Keep** | Add `id` field, `ScopeRouting`, `SerializedError` |
| `execution/src/proxies/sync-handle-proxy.ts` | **Delete** | Replaced by `RemoteSyncHandle` in @max/app |
| `app/src/providers/subprocess/process-manager.ts` | **Keep** | As-is |
| `app/src/providers/subprocess/errors.ts` | **Keep** | As-is |
| `app/src/providers/subprocess/__test__/rpc-roundtrip.test.ts` | **Transform** | Use new dispatchers, add handler roundtrip tests |
| `app/src/protocols/installation-client-proxy.ts` | **Transform** | Schema as ctor param, use RemoteSyncHandle |
| `app/src/protocols/workspace-client-proxy.ts` | **Rewrite** | ScopedTransport, explicit methods |
| `app/src/providers/subprocess/dispatcher.ts` | **Replace** | → InstallationDispatcher + WorkspaceDispatcher in @max/app |
| `app/src/providers/subprocess/transport-client.ts` | **Rewrite** | Persistent connection, native JSONL |
| `app/src/providers/subprocess/installation-provider.ts` | **Transform** | New transport, no ID generation |
| `app/src/providers/subprocess/workspace-provider.ts` | **Transform** | No `workspaceIdFromRoot`, new transport |

---

## 12. Implementation Order

1. **WorkspaceClient surface** — replace `installations: Supervisor<...>` with explicit methods (`listInstallations`, `installation`, `createInstallation`, `removeInstallation`). Supervisor becomes internal to WorkspaceMax.
2. **Handlers** — `EngineHandler`, `SupervisedHandler` + roundtrip tests (loopback transport)
3. **Wire protocol** — `id` and `scope` on RpcRequest, `SerializedError`, `ScopeRouting`
4. **Error serialization** — `MaxError.serialize()` and `MaxError.reconstitute()` in core
5. **RPC errors** — `ErrUnknownTarget`, `ErrUnknownMethod`, `ErrSyncHandleNotFound`
6. **Dispatchers** — `InstallationDispatcher`, `WorkspaceDispatcher` (testable with loopback)
7. **Client proxies** — `InstallationClientProxy` (schema ctor), `RemoteSyncHandle`, `ScopedTransport`, `WorkspaceClientProxy`
8. **Transport** — `Transport.send(RpcRequest)`, `close()`, rewrite `SubprocessTransportClient` with persistent connection + native JSONL
9. **Socket server** — `createSocketServer` adapter
10. **Provider updates** — wire new transport + dispatcher into providers
11. **Named types** — `InstallationHandle`, `WorkspaceHandle`
12. **Package extraction** — move subprocess provider to `@max/provider-subprocess`

Steps 1-7 are testable with loopback transports (no real sockets). Steps 8-9 add the real transport. Step 10 wires everything together.
