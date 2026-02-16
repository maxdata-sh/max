# Spec: ProjectManager

## Purpose

The `ProjectManager` is a service that manages all connector installations within a Max project. It is the single authority on where installations live, how they are identified, and how their associated resources (credentials, config) are accessed.

It abstracts away all storage concerns so that consumers (CLI commands, sync engine, etc.) never interact with the filesystem, paths, or serialization directly.

## Concepts

### Project

A Max project is a directory containing a `.max/` folder. The `ProjectManager` owns the `.max/` directory structure. It is the only thing that reads from or writes to `.max/`.

### Installation

An installation represents a configured connection to a connector. It has:

- **Connector name** — which connector this installation belongs to (e.g., `"acme"`, `"linear"`)
- **Slug** — a human-friendly name, unique within a connector (e.g., `"default"`, `"primary"`, `"staging"`)
- **ID** — a globally unique `InstallationId` (UUID), assigned when the installation is committed
- **Config** — plain configuration data produced by onboarding (no secrets). Opaque to the platform, typed per connector
- **Connected timestamp** — when the installation was committed

The compound key `connector:slug` uniquely identifies an installation for human use. The `InstallationId` identifies it for machine use. Both are valid lookup keys.

### Installation Lifecycle

1. **Prepare** — a `PendingInstallation` is created. It has a connector name and slug but no config, no ID, and is not persisted. The credential store for it is available immediately (for onboarding to write secrets).
2. **Commit** — the pending installation is committed with its config. It becomes a `ManagedInstallation` with an assigned ID and is persisted to storage.
3. **Get** — an existing `ManagedInstallation` is loaded from storage.

If onboarding fails between prepare and commit, nothing is persisted. The credential store may have partial writes — the implementation should handle cleanup (or accept orphaned credentials as harmless).

### Slug Auto-Assignment

When `prepare` is called without a slug:

- If no installations exist for that connector, the slug is `"default"`
- If installations already exist, the slug is auto-incremented: `"default-2"`, `"default-3"`, etc.

The caller can provide an explicit slug to override this behavior.

### Credential Store

Each installation (pending or committed) has an associated `CredentialStore`. The `ProjectManager` creates and returns the credential store for a given installation — the installation data types do not hold service references.

The credential store is scoped per installation. Two installations of the same connector have independent credential stores.

## Interfaces

### Data Types

```typescript
interface PendingInstallation {
  readonly connector: string;
  readonly name: string;    // the slug
}

interface ManagedInstallation {
  readonly connector: string;
  readonly name: string;    // the slug
  readonly id: InstallationId;
  readonly config: unknown;
  readonly connectedAt: string;   // ISO 8601
}

interface InstallationInfo {
  readonly connector: string;
  readonly name: string;
  readonly id: InstallationId;
  readonly connectedAt: string;
}
```

`PendingInstallation` and `ManagedInstallation` are pure data — no methods, no service references, no side effects. They are DTOs.

`InstallationInfo` is the lightweight summary returned by `list()`. It omits config and is suitable for display.

`InstallationId` is a branded string type (`Id<"installation-id">` — soft brand, same pattern as `EntityId`). Already defined in `@max/core`.

### ProjectManager Service

```typescript
interface ProjectManager {
  /** Create a pending installation. Not persisted until commit. */
  prepare(connector: string, name?: string): PendingInstallation;

  /** Persist a pending installation with its config. Returns the committed installation. */
  commit(pending: PendingInstallation, config: unknown): Promise<ManagedInstallation>;

  /** Get the credential store scoped to an installation (pending or committed). */
  credentialStoreFor(installation: PendingInstallation | ManagedInstallation): CredentialStore;

  /** Load an existing installation by connector and optional slug. */
  get(connector: string, name?: string): ManagedInstallation;

  /** Check if an installation exists for a connector (optionally with a specific slug). */
  has(connector: string, name?: string): boolean;

  /** List all committed installations. */
  list(): InstallationInfo[];

  /** Remove an installation and its associated credentials. */
  delete(connector: string, name?: string): Promise<void>;
}
```

#### Method Semantics

**`prepare(connector, name?)`**
- Creates a `PendingInstallation` with the given connector name
- If `name` is omitted, auto-assigns a slug (see "Slug Auto-Assignment" above)
- Does not persist anything — no writes to storage
- Throws if an installation with the same `connector:name` already exists

**`commit(pending, config)`**
- Persists the installation record with: connector, slug, config, a new `InstallationId`, and the current timestamp
- Returns the committed `ManagedInstallation`
- Throws if an installation with the same `connector:name` was committed between prepare and commit (race guard)

**`credentialStoreFor(installation)`**
- Returns a `CredentialStore` scoped to the given installation
- Works for both `PendingInstallation` and `ManagedInstallation` — credentials can be written before commit (during onboarding)
- The returned store is a service with `get`, `set`, `has`, `delete`, `keys` methods
- The store's backing storage is determined by the `ProjectManager` implementation (filesystem for MVP)

**`get(connector, name?)`**
- Loads an existing installation from storage
- If `name` is omitted, returns the default installation for that connector (the one with slug `"default"`, or the only one if there's just one)
- Throws if no matching installation exists

**`has(connector, name?)`**
- Returns `true` if a committed installation exists for the given connector and optional slug
- Same slug resolution as `get` when name is omitted

**`list()`**
- Returns `InstallationInfo[]` for all committed installations across all connectors
- Sorted by connector name, then by slug

**`delete(connector, name?)`**
- Removes the installation record and its associated credential store
- Same slug resolution as `get` when name is omitted
- Throws if no matching installation exists

## Errors

All errors use `MaxError` with the appropriate boundary. Suggested error definitions:

- **InstallationNotFound** — `get`, `delete`, or `credentialStoreFor` called with a connector/slug that doesn't exist
- **InstallationAlreadyExists** — `prepare` or `commit` would create a duplicate `connector:slug`
- **ProjectNotInitialised** — the `.max/` directory doesn't exist (if we require explicit init — see open question)

## Where It Lives

### Package

The `ProjectManager` interface and the data types (`PendingInstallation`, `ManagedInstallation`, `InstallationInfo`) should live in a shared package so they can be referenced by both `@max/connector` and `@max/daemon`.

Recommended: define the interface in `@max/connector` alongside `CredentialStore` (which it references), or in `@max/daemon` since it's a platform service. The filesystem implementation lives wherever the interface is defined.

### Context Integration

The `ProjectManager` instance is placed on `DaemonContext`:

```typescript
class DaemonContext extends Context {
  connectors = Context.instance<ConnectorRegistry>();
  project = Context.instance<ProjectManager>();
}
```

It is created during daemon startup with the resolved project root path.

## Storage Structure (MVP)

The MVP implementation uses the filesystem. The `.max/` directory structure:

```
.max/
  installations/
    <connector>/
      <slug>/
        installation.json     # { id, connector, name, config, connectedAt }
        credentials.json      # { key: value, ... } — managed by CredentialStore
```

Example after `max connect acme`:

```
.max/
  installations/
    acme/
      default/
        installation.json
        credentials.json
```

Example after connecting two Linear workspaces:

```
.max/
  installations/
    linear/
      default/
        installation.json
        credentials.json
      staging/
        installation.json
        credentials.json
```

### installation.json Schema

```json
{
  "id": "inst_a1b2c3d4",
  "connector": "acme",
  "name": "default",
  "config": {
    "workspaceId": "ws-acme-corp"
  },
  "connectedAt": "2026-02-12T10:30:00.000Z"
}
```

### credentials.json Schema

Flat key-value. Values are strings. No encryption for MVP.

```json
{
  "api_token": "sk-test-123"
}
```

The `CredentialStore` implementation for the filesystem is a thin wrapper over this JSON file (read/parse/modify/write). It reuses the existing `CredentialStore` interface from `@max/connector`.

## Consumer Examples

### Connect command (onboarding a new connector)

```typescript
async run({ source }, ctx) {
  const mod = await ctx.connectors.resolve(source);
  const pending = ctx.project.prepare(source);
  const credentialStore = ctx.project.credentialStoreFor(pending);

  const config = await runOnboardingCli(mod.def.onboarding, {
    credentialStore,
  });

  await ctx.project.commit(pending, config);
}
```

### Sync command (using an existing installation)

```typescript
async run({ source }, ctx) {
  const installation = ctx.project.get(source);
  const mod = await ctx.connectors.resolve(installation.connector);
  const credentialStore = ctx.project.credentialStoreFor(installation);
  const provider = CredentialProvider.create(credentialStore);
  const inst = mod.initialise(installation.config, provider);
  await inst.start();
  // ... run sync ...
}
```

### Listing connected integrations

```typescript
async run(_params, ctx) {
  const installations = ctx.project.list();
  // render table: connector | name | connected at
}
```

### Disconnecting

```typescript
async run({ source }, ctx) {
  await ctx.project.delete(source);
}
```

## Open Questions

1. **Project initialisation** — should `ProjectManager` auto-create `.max/` on first write, or require `max init` first? Recommendation: auto-create on first `commit`. The `prepare` step doesn't write, so `.max/` only appears when an installation is actually committed.

2. **Config migration** — when the config schema for a connector changes across versions, how do we handle existing `installation.json` files? Deferred — not MVP.

3. **Credential cleanup on failed onboarding** — if onboarding writes credentials during `InputStep` but then fails at `ValidationStep`, the credential file may have partial data. Options: (a) accept orphaned credentials as harmless, (b) clean up in a `rollback` method on ProjectManager. Recommendation: (a) for MVP — the next `prepare` + successful `commit` will overwrite.

## Out of Scope

- Encryption at rest for credentials
- Audit logging for credential access
- Remote/upstream storage backends (S3, database, etc.)
- Multi-process locking
- Config versioning or migration
- Installation health tracking or status beyond connected/not-connected
