# SPEC: Max URLs and Federation Addressing

> Authored: 2026-02-22. Implementation spec for human-facing URL addressing in the Max federation.
> Status: Design complete, ready for implementation.
> Depends on: Federation — Platforms and Deployers (target architecture)

---

## Overview

Max URLs provide a human-readable, logical addressing scheme for nodes in the federation hierarchy. A URL like `max://~/my-team/hubspot-prod` identifies a node by name, resolved hop-by-hop through the hierarchy. Physical locators (socket paths, container IDs) stay local to each parent-child relationship and never leak upward.

This spec covers five changes:
1. **GlobalScope** — extend the Scope union to three levels
2. **MaxUrl class** — immutable value object implementing ScopeUpgradeable
3. **Locator clarification** — stays as-is, one-hop physical addressing
4. **Name-or-ID lookup** — additions to GlobalClient and WorkspaceClient
5. **URL resolution** — hop-by-hop traversal function

### Design Principles

- **MaxUrl is identity, Locator is physical.** URLs carry names. Locators carry socket paths, container IDs, remote endpoints. They serve different audiences and never contain each other.
- **Physical details never leak upward.** The global level does not know how a workspace hosts its installations. Each level owns its own locators for its direct children.
- **Scope upgrade applies to identity, not locators.** MaxUrl implements ScopeUpgradeable. Locator does not.
- **Resolution is hop-by-hop.** Each node resolves one URL segment using its local registry. No node resolves segments below its direct children.

---

## 1. GlobalScope

### Current state

```typescript
// packages/core/src/scope.ts
interface InstallationScope { kind: 'installation' }
interface WorkspaceScope   { kind: 'workspace'; installationId: InstallationId }
type Scope = InstallationScope | WorkspaceScope
```

Two levels. The comment block mentions Global but it is not implemented.

### Change

Add `GlobalScope` as the third level in the hierarchy:

```typescript
// packages/core/src/scope.ts

export interface GlobalScope {
  readonly kind: 'global'
  readonly workspaceId: WorkspaceId
  readonly installationId: InstallationId
}

export type Scope = InstallationScope | WorkspaceScope | GlobalScope
```

Extend the `Scope` companion:

```typescript
export const Scope = StaticTypeCompanion({
  // ... existing methods unchanged ...

  global(workspaceId: WorkspaceId, installationId: InstallationId): GlobalScope {
    return { kind: 'global', workspaceId, installationId }
  },

  isGlobal(scope: Scope): scope is GlobalScope {
    return scope.kind === 'global'
  },
})
```

### RefKey encoding

Add `egl` prefix to `packages/core/src/ref-key.ts`:

```typescript
const ScopePrefix = {
  installation: 'ein',   // ein:EntityType:EntityId
  workspace: 'ews',      // ews:InstallationId:EntityType:EntityId
  global: 'egl',         // egl:WorkspaceId:InstallationId:EntityType:EntityId
} satisfies Record<Scope['kind'], string>
```

Update `RefKey.from()` and `RefKey.parse()` to handle the `egl` prefix. The global key encodes both workspaceId and installationId before the entity type and ID.

### Ref additions

In `packages/core/src/ref.ts`:

```typescript
export type GlobalRef<E extends EntityDefAny = EntityDefAny> = Ref<E, GlobalScope>
```

Add `Ref.global()` factory to the companion:

```typescript
global<E extends EntityDefAny>(
  def: E, id: EntityId, scope: GlobalScope
): Ref<E, GlobalScope> {
  return new RefImpl(def, id, scope)
}
```

### Scope hierarchy summary

```
InstallationScope     { kind: 'installation' }
        ↓ upgrade: stamp installationId
WorkspaceScope        { kind: 'workspace', installationId }
        ↓ upgrade: stamp workspaceId
GlobalScope           { kind: 'global', workspaceId, installationId }
```

Each level boundary adds exactly one identity.

### Impact

The `Scope` union widens from 2 to 3 members. Exhaustive checks on `scope.kind` must handle `'global'`. Key audit points:
- `RefKey.from()` / `RefKey.parse()` — updated above
- `RefImpl` custom inspect — add global branch
- `ScopeRouting` in `rpc.ts` — already has both workspaceId and installationId, no change needed

### Files

| File | Change |
|------|--------|
| `packages/core/src/scope.ts` | Add `GlobalScope`, extend union, add companion methods |
| `packages/core/src/ref-key.ts` | Add `egl` prefix, update from/parse |
| `packages/core/src/ref.ts` | Add `GlobalRef` alias, `Ref.global()` factory |
| `packages/core/src/index.ts` | Export `GlobalScope` |

---

## 2. MaxUrl Class

### Package placement

MaxUrl lives in `@max/core` because:
- It implements `ScopeUpgradeable` (core interface)
- It depends only on `Scope`, `WorkspaceId`, `InstallationId` (core types)
- It is a schematic value type, not a service
- It must be usable without pulling in `@max/federation`

New file: `packages/core/src/max-url.ts`

### URL format

```
max://[host]/[workspace]/[installation]
```

| Segment | Required | Values |
|---------|----------|--------|
| `host` | Yes | `~` (local, default `~/.max`) or hostname (remote) |
| `workspace` | No | Name or ID |
| `installation` | No | Name or ID |

Three segments max. Each segment is a hop in the federation hierarchy.

```
max://~                                     Global (local)
max://~/my-team                             Workspace by name
max://~/my-team/hubspot-prod                Installation by name
max://staging.max.internal/production       Remote workspace
max://~/ws_abc123                           Workspace by ID
```

### Class design

MaxUrl is a **class** — an immutable value object like JavaScript's `URL`. It implements `ScopeUpgradeable`.

```typescript
export type MaxUrlLevel = 'global' | 'workspace' | 'installation'

export class MaxUrl implements ScopeUpgradeable {
  readonly host: string
  readonly workspace: string | undefined
  readonly installation: string | undefined
  readonly scope: Scope

  private constructor(host, workspace, installation, scope) { ... }

  // ---- Construction ----

  static parse(input: string): MaxUrl
  static global(host?: string): MaxUrl
  static forWorkspace(workspace: string, host?: string): MaxUrl
  static forInstallation(workspace: string, installation: string, host?: string): MaxUrl

  // ---- Structural ----

  get level(): MaxUrlLevel
  get isLocal(): boolean

  parent(): MaxUrl | undefined     // up one level; undefined from global
  child(segment: string): MaxUrl   // down one level; throws from installation

  // ---- ScopeUpgradeable ----

  upgradeScope(newScope: Scope): MaxUrl

  // ---- Serialization ----

  toString(): string               // max://~/my-team/hubspot-prod
  toRelative(context: MaxUrl): string  // "hubspot-prod" relative to context
}
```

### Parsing

```typescript
static parse(input: string): MaxUrl {
  if (!input.startsWith('max://')) {
    throw ErrInvalidMaxUrl.create({ url: input, reason: 'Must start with max://' })
  }

  const path = input.slice('max://'.length)
  const segments = path.split('/').filter(Boolean)

  if (segments.length === 0) {
    throw ErrInvalidMaxUrl.create({ url: input, reason: 'Host segment required' })
  }
  if (segments.length > 3) {
    throw ErrInvalidMaxUrl.create({ url: input, reason: 'Max 3 segments: host/workspace/installation' })
  }

  return new MaxUrl(segments[0], segments[1], segments[2], Scope.installation())
}
```

New URLs start at `InstallationScope` (no enclosing context). Scope is upgraded as the URL crosses boundaries.

### Scope upgrade semantics

`upgradeScope` preserves the URL segments and host. It only changes the scope — the federation context in which this URL was resolved or constructed.

```typescript
upgradeScope(newScope: Scope): MaxUrl {
  return new MaxUrl(this.host, this.workspace, this.installation, newScope)
}
```

This mirrors how `Ref.upgradeScope()` preserves entity type and ID while changing scope.

### Navigation

```typescript
parent(): MaxUrl | undefined {
  if (this.installation) return new MaxUrl(this.host, this.workspace, undefined, this.scope)
  if (this.workspace)    return new MaxUrl(this.host, undefined, undefined, this.scope)
  return undefined  // already at global
}

child(segment: string): MaxUrl {
  if (!this.workspace)    return new MaxUrl(this.host, segment, undefined, this.scope)
  if (!this.installation) return new MaxUrl(this.host, this.workspace, segment, this.scope)
  throw ErrInvalidMaxUrl.create({ url: this.toString(), reason: 'Cannot add child below installation' })
}
```

### Error

Add to `packages/core/src/errors/`:

```typescript
export const ErrInvalidMaxUrl = CoreBoundary.define('invalid_max_url', {
  customProps: ErrFacet.props<{ url: string; reason: string }>(),
  facets: [BadInput],
  message: (d) => `Invalid Max URL "${d.url}" — ${d.reason}`,
})
```

### Files

| File | Change |
|------|--------|
| `packages/core/src/max-url.ts` | NEW — MaxUrl class |
| `packages/core/src/errors/errors.ts` | Add `ErrInvalidMaxUrl` |
| `packages/core/src/index.ts` | Export `MaxUrl`, `MaxUrlLevel` |

---

## 3. Locator — No Change

Locator stays as a discriminated union. It represents one-hop physical addressing from a parent to its direct child.

```typescript
// Unchanged — packages/core/src/federation/node-handle.ts
interface Locator { readonly strategy: DeployerKind }

// Deployer-specific extensions (unchanged)
interface InProcessLocator extends Locator { strategy: 'in-process' }
interface DaemonLocator extends Locator    { strategy: 'daemon'; socketPath: string }
interface RemoteLocator extends Locator    { strategy: 'remote'; url: string }
interface DockerLocator extends Locator    { strategy: 'docker'; containerId: string; port: number }
```

### Why Locator does NOT implement ScopeUpgradeable

1. **Physical details must not leak upward.** The global level should not see installation socket paths. Each level owns locators for its direct children only.
2. **Locators are consumed by deployers.** A deployer receives a locator and uses it to establish transport. This is a local operation — it does not cross scope boundaries.
3. **The identity chain (what the URL carries) and the physical chain (what locators carry) are separate concerns.** The URL provides logical routing. The locator provides physical connectivity. They never contain each other.

### How locators and URLs relate at runtime

```
max://~/my-team/hubspot-prod
       │           │
       │           └── WorkspaceMax resolves "hubspot-prod"
       │               using its local installation registry + locator
       │               (the locator might be: { strategy: 'in-process' })
       │
       └── GlobalMax resolves "my-team"
           using its local workspace registry + locator
           (the locator might be: { strategy: 'daemon', socketPath: '/var/...' })
```

Each level uses its own locators internally. The URL resolver just calls client methods; it never sees a locator.

---

## 4. Name-or-ID Lookup

### Interface additions

The URL resolver needs to look up nodes by name (from URL segments). Currently, `workspace()` and `installation()` only accept branded IDs.

Add a new method to each client interface that accepts a raw string and returns both the resolved ID and the client:

**GlobalClient** (`packages/federation/src/protocols/global-client.ts`):

```typescript
export interface GlobalClient extends Supervised {
  // ... existing methods unchanged ...

  /** Lookup a workspace by name or ID. Tries name first, then ID. */
  workspaceByNameOrId(nameOrId: string): { id: WorkspaceId; client: WorkspaceClient } | undefined
}
```

**WorkspaceClient** (`packages/federation/src/protocols/workspace-client.ts`):

```typescript
export interface WorkspaceClient extends Supervised {
  // ... existing methods unchanged ...

  /** Lookup an installation by name or ID. Tries name first, then ID. */
  installationByNameOrId(nameOrId: string): { id: InstallationId; client: InstallationClient } | undefined
}
```

### Why return `{ id, client }` instead of just `client`

The URL resolver needs both:
- The **client** to continue resolving deeper segments or to return as the resolved target
- The **ID** to populate the `ResolvedTarget` (which carries IDs for scope construction)

Returning both from a single scan avoids a double lookup.

### Why a separate method instead of widening `workspace()`

- `workspace(id: WorkspaceId)` remains type-safe with the branded ID type
- `workspaceByNameOrId(nameOrId: string)` accepts raw strings for URL resolution
- No breaking change to existing callers
- The name-or-ID method returns `| undefined` consistently (the existing `installation()` does not)

### Implementation

**GlobalMax** (`packages/federation/src/federation/global-max.ts`):

```typescript
workspaceByNameOrId(nameOrId: string): { id: WorkspaceId; client: WorkspaceClient } | undefined {
  // Try name first: scan registry
  const byName = this.workspaceRegistry.list().find(e => e.name === nameOrId)
  if (byName) {
    const handle = this.workspaceSupervisor.get(byName.id)
    if (handle) return { id: byName.id, client: handle.client }
  }

  // Fall back to ID
  const handle = this.workspaceSupervisor.get(nameOrId as WorkspaceId)
  if (handle) return { id: nameOrId as WorkspaceId, client: handle.client }

  return undefined
}
```

**WorkspaceMax** (`packages/federation/src/federation/workspace-max.ts`):

```typescript
installationByNameOrId(nameOrId: string): { id: InstallationId; client: InstallationClient } | undefined {
  // Try name first: scan registry
  const byName = this.installationRegistry.list().find(e => e.name === nameOrId)
  if (byName) {
    const handle = this.supervisor.get(byName.id)
    if (handle) return { id: byName.id, client: handle.client }
  }

  // Fall back to ID
  const handle = this.supervisor.get(nameOrId as InstallationId)
  if (handle) return { id: nameOrId as InstallationId, client: handle.client }

  return undefined
}
```

Name takes priority over ID. If a name matches, it wins — even if the string also happens to be a valid ID for a different node.

### RPC considerations

`workspaceByNameOrId` and `installationByNameOrId` are **local-only operations**. URL resolution happens at the edge (CLI, API gateway) against the node that owns the registry. The RPC proxies (`WorkspaceClientProxy`) do not need these methods — they are not part of the RPC protocol.

### Files

| File | Change |
|------|--------|
| `packages/federation/src/protocols/global-client.ts` | Add `workspaceByNameOrId` |
| `packages/federation/src/protocols/workspace-client.ts` | Add `installationByNameOrId` |
| `packages/federation/src/federation/global-max.ts` | Implement lookup |
| `packages/federation/src/federation/workspace-max.ts` | Implement lookup |
| `packages/federation/src/testing.ts` | Add to stubs |

---

## 5. URL Resolution

### Package placement

The resolution function lives in `@max/federation` because it depends on `GlobalClient`, `WorkspaceClient`, and `InstallationClient` — all federation protocols.

New file: `packages/federation/src/federation/resolve-url.ts`

### ResolvedTarget type

```typescript
export type ResolvedTarget =
  | { level: 'global';       client: GlobalClient }
  | { level: 'workspace';    client: WorkspaceClient;     id: WorkspaceId }
  | { level: 'installation'; client: InstallationClient;  id: InstallationId;  workspaceId: WorkspaceId }
```

Each variant carries enough context to construct a scope or navigate further.

### Resolution function

```typescript
export function resolveUrl(url: MaxUrl, global: GlobalClient): ResolvedTarget {
  // Guard: local only for now
  if (!url.isLocal) {
    throw ErrRemoteUrlNotSupported.create({ url: url.toString() })
  }

  // Level 0: Global
  if (url.level === 'global') {
    return { level: 'global', client: global }
  }

  // Level 1: Workspace
  const ws = global.workspaceByNameOrId(url.workspace!)
  if (!ws) {
    throw ErrWorkspaceNotResolved.create({ segment: url.workspace!, url: url.toString() })
  }

  if (url.level === 'workspace') {
    return { level: 'workspace', client: ws.client, id: ws.id }
  }

  // Level 2: Installation
  const inst = ws.client.installationByNameOrId(url.installation!)
  if (!inst) {
    throw ErrInstallationNotResolved.create({
      segment: url.installation!,
      workspace: url.workspace!,
      url: url.toString(),
    })
  }

  return { level: 'installation', client: inst.client, id: inst.id, workspaceId: ws.id }
}
```

Each node resolves one segment. The resolver never sees locators — it only calls client methods.

### Error definitions

Add to `packages/federation/src/errors/errors.ts`:

```typescript
export const ErrRemoteUrlNotSupported = AppBoundary.define('remote_url_not_supported', {
  customProps: ErrFacet.props<{ url: string }>(),
  facets: [NotSupported],
  message: (d) => `Remote Max URLs are not yet supported: ${d.url}`,
})

export const ErrWorkspaceNotResolved = AppBoundary.define('workspace_not_resolved', {
  customProps: ErrFacet.props<{ segment: string; url: string }>(),
  facets: [NotFound],
  message: (d) => `Workspace "${d.segment}" not found — ${d.url}`,
})

export const ErrInstallationNotResolved = AppBoundary.define('installation_not_resolved', {
  customProps: ErrFacet.props<{ segment: string; workspace: string; url: string }>(),
  facets: [NotFound],
  message: (d) => `Installation "${d.segment}" not found in workspace "${d.workspace}" — ${d.url}`,
})
```

### Files

| File | Change |
|------|--------|
| `packages/federation/src/federation/resolve-url.ts` | NEW — `resolveUrl`, `ResolvedTarget` |
| `packages/federation/src/errors/errors.ts` | Add resolution errors |
| `packages/federation/src/federation/index.ts` | Export |
| `packages/federation/src/index.ts` | Re-export |

---

## 6. CLI Integration (Deferred)

Not part of this implementation phase, but noted for context:

- `--target` flag accepts any Max URL string (parsed via `MaxUrl.parse()`)
- `--workspace` convenience alias constructs `MaxUrl.forWorkspace(name)`
- `--installation` convenience alias within workspace context uses `child()`
- Relative URLs resolved against current scope context (workspace root from `cwd`)
- `MAX_WORKSPACE` environment variable sets default workspace scope

---

## Implementation Order

```
Phase 1: GlobalScope
  └─ scope.ts, ref-key.ts, ref.ts, index.ts
  └─ No external dependencies. Foundation for everything else.

Phase 2: MaxUrl class
  └─ max-url.ts, errors.ts, index.ts
  └─ Depends on: Scope (Phase 1)

Phase 3: Name-or-ID lookup
  └─ global-client.ts, workspace-client.ts, global-max.ts, workspace-max.ts, testing.ts
  └─ Independent of Phase 2. Can be parallel.

Phase 4: URL resolution
  └─ resolve-url.ts, errors.ts, index.ts
  └─ Depends on: MaxUrl (Phase 2), name-or-ID lookup (Phase 3)

Phase 5: CLI integration (separate ticket)
  └─ Depends on: Phase 4
```

---

## Testing

### MaxUrl (`packages/core/src/__test__/max-url.test.ts`)

**Parse:**
- `max://~` → global, host `~`
- `max://~/my-project` → workspace, host `~`, workspace `my-project`
- `max://~/my-project/linear` → installation level
- `max://example.com/ws/inst` → remote host
- Rejects: no prefix, empty, >3 segments, missing host

**Round-trip:** `MaxUrl.parse(url.toString())` preserves all fields

**Navigation:**
- `parent()` from each level (installation → workspace → global → undefined)
- `child()` from each level (global → workspace → installation → throws)

**ScopeUpgradeable:** `upgradeScope()` preserves URL segments, changes only scope

### GlobalScope (`packages/core/src/__test__/scope.test.ts`)

- `Scope.global(wsId, instId)` returns `{ kind: 'global', workspaceId, installationId }`
- `Scope.isGlobal()` type guard
- `RefKey.from()` with global scope → `egl:wsId:instId:type:id`
- `RefKey.parse()` round-trips global keys

### Name-or-ID Lookup

- Name match returns `{ id, client }`
- ID fallback when no name matches
- Returns `undefined` for unknown name and ID
- Name priority: name wins when string matches both a name and a different ID

### resolveUrl (`packages/federation/src/__test__/resolve-url.test.ts`)

Setup: GlobalMax with in-memory registries, 1 workspace ("my-team"), 1 installation ("hubspot-prod").

- `max://~` → global level, returns GlobalClient
- `max://~/my-team` → workspace level, returns WorkspaceClient + correct ID
- `max://~/my-team/hubspot-prod` → installation level, returns InstallationClient + both IDs
- `max://~/nonexistent` → throws ErrWorkspaceNotResolved
- `max://~/my-team/nonexistent` → throws ErrInstallationNotResolved
- `max://remote.host/ws` → throws ErrRemoteUrlNotSupported

---

## Summary

| Concept | Type | Where | Role |
|---------|------|-------|------|
| **MaxUrl** | Class (ScopeUpgradeable) | `@max/core` | Human-facing identity chain. Travels freely. |
| **Locator** | Discriminated union | `@max/core` | Machine-facing one-hop address. Stays local. |
| **GlobalScope** | Interface | `@max/core` | Third scope level: workspaceId + installationId. |
| **resolveUrl** | Function | `@max/federation` | Walks URL segments hop-by-hop via client methods. |
| **workspaceByNameOrId** | Method | `GlobalClient` | Name-first, ID-fallback lookup for URL resolution. |
| **installationByNameOrId** | Method | `WorkspaceClient` | Name-first, ID-fallback lookup for URL resolution. |

Physical details never leak upward. URLs carry identity. Locators carry connectivity. Resolution walks the identity chain; each node resolves one segment using its own locators internally.

---

## Related

- [Federation — Platforms and Deployers](../design-docs/notes/Federation%20-%20Platforms%20and%20Deployers.md) — deployer architecture, locator definitions
- [Federation — Max URLs](../design-docs/notes/Federation%20-%20Max%20URLs.md) — original design note (this spec supersedes it for implementation)
- [Federation — Scoped Address](../design-docs/notes/Federation%20-%20Scoped%20Address.md) — scoped addresses, scope upgrade mechanics
