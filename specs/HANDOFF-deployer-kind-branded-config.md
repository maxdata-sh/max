# Handoff: Branded DeployerKind with Config Type + Platform Deploy Constants

## Goal

Introduce a **phantom config type on `DeployerKind`** so that deployer selection carries type information through a branded string. Update `GlobalMax.createWorkspace()` and `WorkspaceMax.createInstallation()` to use a `{ via, config, spec }` pattern where `via` is a branded `DeployerKind<TConfig>` string that TypeScript uses to infer the correct config type.

Add `deploy` constants to the platform so developers can reference deployers by name with full type safety, while dynamic/reconciliation code uses the same string values without type narrowing.

## Context

Currently, `createWorkspace` and `createInstallation` accept a `DeploymentConfig` (base type with `strategy: DeployerKind`). The deployer is selected at runtime by looking up `config.strategy` in a `DeployerRegistry`. This works but provides no type-level link between the deployer strategy and its config shape — the developer gets no autocomplete on deployer-specific config fields.

The design lifts the config type into a phantom type parameter on the branded `DeployerKind` string. Because `DeployerKind` uses `SoftBrand` (naked string assignment works), the same string value serves both the typed path (from platform constants) and the dynamic path (from persisted config).

## What Exists

### Core brand system (`packages/core/src/brand.ts`)

- `SoftBrand<U, Name>` — branded type allowing naked assignment. Uses `[SoftBrandTag]?: Name`.
- `Id<Name>` — convenience: `SoftBrand<string, Name>`.
- `HardBrand<U, Name>` — requires explicit construction.

### DeployerKind (`packages/core/src/federation/deployer.ts`)

Current definition:
```typescript
export type DeployerKind = Id<'deployer-kind'>
```

Used on the `Deployer` interface:
```typescript
export interface Deployer<
  R extends Supervised = Supervised,
  TConfig extends DeploymentConfig = DeploymentConfig,
  TLocator extends Locator = Locator,
  TSpec extends DeployableSpec = DeployableSpec,
> {
  readonly deployerKind: DeployerKind
  create(config: TConfig, nodeSpec: TSpec): Promise<UnlabelledHandle<R, TLocator>>
  connect(location: TLocator): Promise<UnlabelledHandle<R, TLocator>>
  teardown(config: TLocator): Promise<void>
}
```

### DeploymentConfig (`packages/federation/src/deployers/deployment-config.ts`)

```typescript
export interface DeploymentConfig extends UnknownConfig {
  strategy: DeployerKind
}
```

### Concrete deployer configs (`packages/platform-bun/src/deployers/types.ts`)

- `InProcessDeploymentConfig` — `{ strategy: 'in-process', dataDir: string, engine?, credentials?, ... }`
- `DaemonDeploymentConfig` — `{ strategy: 'daemon', daemonDir: string, dataRoot: string, ... }`
- `DockerDeploymentConfig` — `{ strategy: 'docker', image: string, ... }`
- `RemoteDeploymentConfig` — `{ strategy: 'remote', url: string, ... }`

### Platform interface (`packages/federation/src/platform/platform.ts`)

```typescript
export interface Platform {
  name: PlatformName
  installation: DeployerRegistry<InstallationDeployer>
  workspace: DeployerRegistry<WorkspaceDeployer>
  createGlobalMax(): GlobalMax
  general: { createSupervisor(): Supervisor<any> }
}
```

### GlobalClient (`packages/federation/src/protocols/global-client.ts`)

```typescript
export interface GlobalClient extends Supervised {
  createWorkspace(name: string, config: DeploymentConfig, spec: WorkspaceSpec): Promise<WorkspaceId>
  // ...
}
```

### WorkspaceClient (`packages/federation/src/protocols/workspace-client.ts`)

```typescript
export interface CreateInstallationConfig {
  readonly spec: InstallationSpec
  readonly hosting: PlatformConfig  // PlatformConfig = DeploymentConfig
}
```

### GlobalMax (`packages/federation/src/federation/global-max.ts`)

Current `createWorkspace` signature:
```typescript
async createWorkspace(name: string, config: DeploymentConfig, spec: WorkspaceSpec): Promise<WorkspaceId>
```

### WorkspaceMax (`packages/federation/src/federation/workspace-max.ts`)

Current `createInstallation`:
```typescript
async createInstallation(config: CreateInstallationConfig): Promise<InstallationId>
// Internally: this.installationDeployer.get(config.hosting.strategy)
```

### BunPlatform (`packages/platform-bun/src/bun-platform.ts`)

Currently exports a `Platform.define({...})` object with `installation` and `workspace` as `DeployerRegistry` instances. No typed deploy constants exist.

### DeployerRegistry (`packages/federation/src/deployers/deployer-registry.ts`)

Already has a local `ConfigOf` type that extracts config from a deployer. The registry's `get()` method takes a `DeployerKind` and returns a `TDeployers`.

---

## Changes

### Step 1: Extend `DeployerKind` with config phantom type

**File:** `packages/core/src/federation/deployer.ts`

Replace:
```typescript
export type DeployerKind = Id<'deployer-kind'>
```

With:
```typescript
/**
 * DeployerKind — Branded string identifying a deployment strategy.
 *
 * Carries a phantom type parameter TConfig representing the deployer's
 * config shape. When constructed via DeployerKind.create<TConfig>(), the
 * string carries type info at compile time. When assigned from a plain
 * string (e.g., from persisted config), TConfig defaults to unknown.
 *
 * This unifies typed and dynamic deployer selection into one code path.
 */
export type DeployerKind<TConfig = unknown> = Id<'deployer-kind'> & {
  readonly __config?: TConfig
}

export const DeployerKind = {
  /** Create a typed deployer kind constant. The string value is used at runtime; TConfig is compile-time only. */
  create<TConfig>(name: string): DeployerKind<TConfig> {
    return name as DeployerKind<TConfig>
  },
}

/** Extract the config type carried by a DeployerKind. */
export type ConfigOf<K extends DeployerKind> = K extends DeployerKind<infer C> ? C : never
```

**Important:** `DeployerKind` is now **both a type and a companion object** (Type + Companion Object pattern, per `CLAUDE.patterns.md`). `DeployerKind` without a type parameter defaults to `DeployerKind<unknown>`, which is backward-compatible — existing code using `DeployerKind` as a plain branded string still compiles.

### Step 2: Update Deployer interface to carry config type on deployerKind

**File:** `packages/core/src/federation/deployer.ts`

The `deployerKind` field on the `Deployer` interface should carry the config type. Update:

```typescript
export interface Deployer<
  R extends Supervised = Supervised,
  TConfig extends DeploymentConfig = DeploymentConfig,
  TLocator extends Locator = Locator,
  TSpec extends DeployableSpec = DeployableSpec,
> {
  readonly deployerKind: DeployerKind<TConfig>   // ← now carries TConfig
  create(config: TConfig, nodeSpec: TSpec): Promise<UnlabelledHandle<R, TLocator>>
  connect(location: TLocator): Promise<UnlabelledHandle<R, TLocator>>
  teardown(config: TLocator): Promise<void>
}
```

### Step 3: Update concrete deployers to use typed DeployerKind

**File:** `packages/platform-bun/src/deployers/general/inprocess-deployer.ts`

The `deployerKind` field assignment should use `DeployerKind.create<InProcessDeploymentConfig>('in-process')`. Read the file to find the current assignment and update it.

Do the same for:
- `packages/platform-bun/src/deployers/general/daemon-deployer.ts` — `DeployerKind.create<DaemonDeploymentConfig>('daemon')`
- `packages/platform-bun/src/deployers/general/docker-deployer.ts` — `DeployerKind.create<DockerDeploymentConfig>('docker')`
- `packages/platform-bun/src/deployers/general/remote-deployer.ts` — `DeployerKind.create<RemoteDeploymentConfig>('remote')`

### Step 4: Add `deploy` constants to Platform and BunPlatform

**File:** `packages/federation/src/platform/platform.ts`

Update the Platform interface to include a `deploy` namespace alongside the existing deployer registry. The registry is kept for runtime routing (reconciliation); `deploy` is for typed DX:

```typescript
export interface Platform {
  name: PlatformName
  installation: {
    deploy: Record<string, DeployerKind<any>>
    registry: DeployerRegistry<InstallationDeployer>
  }
  workspace: {
    deploy: Record<string, DeployerKind<any>>
    registry: DeployerRegistry<WorkspaceDeployer>
  }
  createGlobalMax(): GlobalMax
  general: {
    createSupervisor(): Supervisor<any>
  }
}
```

**Note:** The `Record<string, DeployerKind<any>>` on the interface is loose — the concrete BunPlatform definition (via `Platform.define()`) preserves the exact literal types because `define` uses `const` type parameter.

Remove the `PlatformWorkspaceSupport`, `PlatformInstallationSupport` mixins, `readPlatformWorkspaceConfig` type, and `PlatformConfig` alias — they are remnants of the old API and are no longer needed. (Search for usages first; `PlatformConfig` is used in several files as an alias for `DeploymentConfig` — replace those usages with `DeploymentConfig` directly.)

**File:** `packages/platform-bun/src/bun-platform.ts`

Update the BunPlatform definition to expose deploy constants. The current structure is:

```typescript
export const BunPlatform = Platform.define({
  name: 'bun',
  installation: new DeployerRegistry('bun', [
    inProcessInstallationDeployer,
    daemonInstallationDeployer,
  ]),
  workspace: new DeployerRegistry('bun', [
    inProcessWorkspaceDeployer,
    daemonWorkspaceDeployer,
  ]),
  // ...
})
```

Change to:

```typescript
export const BunPlatform = Platform.define({
  name: 'bun' as PlatformName,
  installation: {
    deploy: {
      inProcess: DeployerKind.create<InProcessDeploymentConfig>('in-process'),
      daemon: DeployerKind.create<DaemonDeploymentConfig>('daemon'),
    },
    registry: new DeployerRegistry('bun', [
      inProcessInstallationDeployer,
      daemonInstallationDeployer,
    ]),
  },
  workspace: {
    deploy: {
      inProcess: DeployerKind.create<InProcessDeploymentConfig>('in-process'),
      daemon: DeployerKind.create<DaemonDeploymentConfig>('daemon'),
    },
    registry: new DeployerRegistry('bun', [
      inProcessWorkspaceDeployer,
      daemonWorkspaceDeployer,
    ]),
  },
  general: {
    createSupervisor(): Supervisor<any> {
      return new DefaultSupervisor(() => crypto.randomUUID() as string)
    },
  },
  createGlobalMax() {
    const root = path.join(os.homedir(), '.max')
    const workspaceRegistry = resolvers.global.workspaceRegistry.resolve(root)
    const supervisor = this.general.createSupervisor()
    return new GlobalMax({
      workspaceDeployer: this.workspace.registry,
      workspaceRegistry,
      workspaceSupervisor: supervisor,
    })
  },
})
```

### Step 5: Update GlobalClient and GlobalMax to use `{ via, config, spec }` pattern

**File:** `packages/federation/src/protocols/global-client.ts`

Replace `createWorkspace` signature:

```typescript
import { DeployerKind, ConfigOf, WorkspaceId, Supervised } from '@max/core'
import { WorkspaceSpec } from '../config/index.js'

export interface GlobalClient extends Supervised {
  listWorkspaces(): Promise<WorkspaceInfo[]>
  workspace(id: WorkspaceId): WorkspaceClient | undefined

  createWorkspace<K extends DeployerKind>(
    name: string,
    args: CreateWorkspaceArgs<K>
  ): Promise<WorkspaceId>

  removeWorkspace(id: WorkspaceId): Promise<void>
}

export interface CreateWorkspaceArgs<K extends DeployerKind = DeployerKind> {
  via: K
  config: ConfigOf<K>
  spec?: WorkspaceSpec
}
```

**File:** `packages/federation/src/federation/global-max.ts`

Update `GlobalMax.createWorkspace` to match:

```typescript
async createWorkspace<K extends DeployerKind>(
  name: string,
  args: CreateWorkspaceArgs<K>
): Promise<WorkspaceId> {
  // Runtime lookup by the string value of args.via
  const deployer = this.workspaceDeployer.get(args.via)
  const unlabelled = await deployer.create(args.config as DeploymentConfig, args.spec ?? { name })

  const handle = this.workspaceSupervisor.register(unlabelled)

  this.workspaceRegistry.add({
    id: handle.id,
    name: name,
    connectedAt: ISODateString.now(),
    config: { ...args.config, strategy: args.via } as DeploymentConfig,
  })

  await this.workspaceRegistry.persist()
  await handle.client.start()

  return handle.id
}
```

The `as DeploymentConfig` cast is the one place where the implementation trusts the brand contract. This is intentional and confined — the entire public API surface is type-safe via the `ConfigOf<K>` inference.

Also remove the stray `config.workspace` expression on the current line 61.

### Step 6: Update WorkspaceClient and WorkspaceMax to use `{ via, config, spec }` pattern

**File:** `packages/federation/src/protocols/workspace-client.ts`

Replace `CreateInstallationConfig`:

```typescript
import { DeployerKind, ConfigOf } from '@max/core'
import { InstallationSpec } from '../config/installation-spec.js'

export interface CreateInstallationConfig<K extends DeployerKind = DeployerKind> {
  readonly via: K
  readonly config: ConfigOf<K>
  readonly spec: InstallationSpec
}
```

Update `WorkspaceClient`:

```typescript
export interface WorkspaceClient extends Supervised {
  createInstallation<K extends DeployerKind>(config: CreateInstallationConfig<K>): Promise<InstallationId>
  // ... rest unchanged
}
```

**File:** `packages/federation/src/federation/workspace-max.ts`

Update `WorkspaceMax.createInstallation`:

```typescript
async createInstallation<K extends DeployerKind>(config: CreateInstallationConfig<K>): Promise<InstallationId> {
  const { spec } = config
  const name = spec.name ?? spec.connector

  // Deduplicate
  const existing = this.installationRegistry.list().find(
    (e) => e.connector === spec.connector && e.name === name
  )
  if (existing) {
    throw ErrInstallationAlreadyExists.create({ connector: spec.connector, name })
  }

  // Runtime lookup by the string value of config.via
  const deployer = this.installationDeployer.get(config.via)
  const unlabelled = await deployer.create(config.config as DeploymentConfig, spec)

  const handle = this.supervisor.register(unlabelled)

  this.installationRegistry.add({
    id: handle.id,
    connector: spec.connector,
    name,
    connectedAt: ISODateString.now(),
    locator: unlabelled.locator,
  })

  await handle.client.start()

  return handle.id
}
```

### Step 7: Update internal references to `installation` and `workspace` on Platform

Because `Platform.installation` and `Platform.workspace` changed from `DeployerRegistry<...>` to `{ deploy: ..., registry: DeployerRegistry<...> }`, update all internal code that accesses them:

1. **`packages/federation/src/federation/workspace-max.ts`** — `WorkspaceMaxConstructable.installationDeployer` is currently `DeployerRegistry<InstallationDeployer>`. This stays as-is — the workspace receives the registry, not the full platform level.

2. **`packages/federation/src/federation/global-max.ts`** — `GlobalMaxConstructable.workspaceDeployer` is currently `DeployerRegistry<WorkspaceDeployer>`. Same — stays as-is.

3. **`packages/federation/src/federation/bootstrap/bootstrap-workspace.ts`** — currently takes `platform: Platform` and accesses `platform.installation`. Update to use `platform.installation.registry` instead. Read the file to find the exact line.

4. **`packages/platform-bun/src/bun-platform.ts`** — the `createGlobalMax` method passes `this.workspace` to `workspaceDeployer`. Update to `this.workspace.registry`.

5. **`packages/federation/src/deployers/deployer-registry.ts`** — has a local `ConfigOf` type alias. This will conflict with the new `ConfigOf` exported from core. Remove the local one and import from core instead (or rename one of them to avoid ambiguity — the registry's local one is only used for the `configure` method which appears to be unused).

### Step 8: Export new types from barrel files

**File:** `packages/core/src/federation/index.ts`

Ensure `ConfigOf` is exported:
```typescript
export { DeployerKind, ConfigOf, type Deployer } from './deployer.js'
```

**File:** `packages/core/src/index.ts`

Ensure `ConfigOf` reaches the package-level export (it should, if `federation/index.ts` re-exports it and `core/index.ts` re-exports from federation).

### Step 9: Update the smoke test

**File:** `packages/platform-bun/src/__test__/in-process-provider.smoke.test.ts`

Rewrite to use the new API as proof:

```typescript
import { describe, test, expect } from 'bun:test'
import { BunPlatform } from '../bun-platform.js'
import { AcmeUser } from '@max/connector-acme'
import { Projection } from '@max/core'

describe('in-process-provider', () => {
  test('smoke test — ephemeral workspace with in-process installation', async () => {
    const global = BunPlatform.createGlobalMax()
    await global.start()

    // Create workspace via typed deployer kind
    const wsId = await global.createWorkspace('test-workspace', {
      via: BunPlatform.workspace.deploy.inProcess,
      config: {
        strategy: 'in-process',
        dataDir: '/tmp/max-smoke-test',
      },
      spec: { name: 'test-workspace' },
    })

    const workspace = global.workspace(wsId)
    expect(workspace).toBeDefined()

    // Create installation via typed deployer kind
    const instId = await workspace!.createInstallation({
      via: BunPlatform.installation.deploy.inProcess,
      config: {
        strategy: 'in-process',
        dataDir: '/tmp/max-smoke-test/installations/acme',
      },
      spec: {
        connector: 'acme',
        name: 'default',
        connectorConfig: { workspaceId: '123' },
      },
    })

    // Verify installation is accessible
    const installations = await workspace!.listInstallations()
    expect(installations.length).toBe(1)
    expect(installations[0].connector).toBe('acme')

    // Clean up
    await global.stop()
  })
})
```

### Step 10: Update CLI references

**File:** `packages/cli/src/index.ts`

The CLI currently references `BunPlatform.SameProcess`, `BunPlatform.Daemon`, `BunPlatform.resolve`, `BunPlatform.printers` — none of which exist. Update:

1. Replace `this.platforms = new PlatformRegistry(BunPlatform.SameProcess, [...])` — remove entirely (PlatformRegistry is not needed; the CLI uses one platform).

2. Replace `lazy.workspace` — should go through `getCurrentWorkspace` which routes through `GlobalMax`:
```typescript
await this.getCurrentWorkspace()
```

3. Replace `lazy.workspaceProvider` — remove entirely.

4. Replace `lazy.global` implementation — use `BunPlatform.createGlobalMax()`:
```typescript
global: () => BunPlatform.createGlobalMax()
```

5. Replace `runInit` — use new `createWorkspace` API:
```typescript
const max = await this.getGlobalMax()
await max.createWorkspace(path.basename(dir), {
  via: BunPlatform.workspace.deploy.inProcess,
  config: { strategy: 'in-process', dataDir: path.join(dir, '.max') },
  spec: { name: path.basename(dir) },
})
```

6. Replace `runConnect` — update `createInstallation` call:
```typescript
const id = await ws.createInstallation({
  via: BunPlatform.installation.deploy.inProcess,
  config: {
    strategy: 'in-process',
    dataDir: path.join(this.cfg.workspaceRoot!, '.max', 'installations', arg.source),
  },
  spec: {
    connector: arg.source,
    connectorConfig: config,
    initialCredentials: credentialKeys.length > 0 ? initialCredentials : undefined,
  },
})
```

7. Replace `runDaemon` `list` case — `BunPlatform.printers.WorkspaceEntry` doesn't exist. For now, replace with a simple formatter or move the printer onto BunPlatform as a separate concern.

**File:** `packages/cli/src/subprocess-entry.ts`

Line 59: `BunPlatform.installation.inProcess({...})` no longer works (installation is now `{ deploy, registry }`). Update to get the deployer from the registry:

```typescript
const deployer = BunPlatform.installation.registry.get('in-process' as DeployerKind)
const handle = await deployer.create(
  { strategy: 'in-process', dataDir: args.dataRoot, connectorRegistry: { type: 'hardcoded', moduleMap: { [spec.connector]: `@max/connector-${spec.connector}` } } },
  spec
)
```

Or more cleanly, construct the deployer config and use the registry:
```typescript
const config = { strategy: 'in-process' as DeployerKind, dataDir: args.dataRoot }
const deployer = BunPlatform.installation.registry.get(config.strategy)
const handle = await deployer.create(config, spec)
```

---

## Cleanup

These items should be addressed as part of this change:

1. **Remove `PlatformConfig` alias** from `packages/federation/src/platform/platform.ts` (it's just `DeploymentConfig`). Replace all usages:
   - `packages/federation/src/protocols/global-client.ts` — `WorkspaceInfo.config`
   - `packages/federation/src/protocols/workspace-client.ts` — `CreateInstallationConfig.hosting` (being replaced anyway)
   - `packages/federation/src/federation/workspace-max.ts`
   - `packages/federation/src/federation/workspace-registry.ts`
   - `packages/federation/src/platform/platform.ts` itself

2. **Remove `PlatformWorkspaceSupport` and `PlatformInstallationSupport`** interfaces from `platform.ts` — they're from the old `fromConfig` pattern.

3. **Remove `readPlatformWorkspaceConfig`** type utility from `platform.ts`.

4. **Remove unused `NodeProvider` import** from `packages/federation/src/deployers/workspace-deployer.ts` line 1.

5. **Resolve local `ConfigOf` conflict** in `packages/federation/src/deployers/deployer-registry.ts` — either remove the local `ConfigOf` (it's only used by the `configure` method which is a passthrough) or rename it.

---

## Validation

After all changes, verify:

1. **Type check passes**: `turbo run typecheck` from worktree root. Attempt this once and check in with the human, as the codebase is not currently in a compiling state. He will guide you.
2. **Smoke test runs**: `cd packages/platform-bun && bun test src/__test__/in-process-provider.smoke.test.ts`
3. **Type inference works**: In the smoke test, hovering over `config:` in `createWorkspace(...)` should show `InProcessDeploymentConfig`, not `DeploymentConfig` or `unknown`.
4. **Dynamic path compiles**: Code like `createWorkspace("x", { via: entry.strategy as DeployerKind, config: entry.config, spec: entry.spec })` should compile without errors (config is `unknown`, no type constraint).

---

## What This Does NOT Cover

- **Startup reconciliation** (loading persisted workspaces/installations and reconnecting) — separate task.
- **Default config derivation** (deriving dataDir from workspace name + convention) — will be addressed when the resolver graph is reworked.
- **Removing old `providers/` directory** in federation — separate cleanup.
- **Daemon printers** — the CLI's `BunPlatform.printers` reference needs a separate solution.
