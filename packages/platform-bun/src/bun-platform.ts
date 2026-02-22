/**
 * BunPlatform — Strongly-typed entry point for the Bun platform.
 *
 * Uses ResolverGraph for declarative dependency wiring at each federation level:
 * - installationGraph: deployment config → installation services (engine, credentials, task store, sync meta)
 * - workspaceGraph: deployment config → workspace services (installation registry, connector registry)
 * - globalGraph: config → global services (workspace registry)
 *
 * Graphs support `.with()` for dependency injection and cascading overrides.
 * Override `engine` with an in-memory engine and taskStore/syncMeta cascade automatically.
 *
 * @example
 *   // Ephemeral installation — everything cascades through the :memory: engine
 *   const ephemeral = installationGraph.with({
 *     engine: (c) => SqliteEngine.open(':memory:', c.connector.def.schema),
 *   })
 *
 *   // Inject a pre-built credential store
 *   const withCreds = installationGraph.with({
 *     credentialStore: () => myExistingCredentialStore,
 *   })
 *
 *   // Inject at any level via createGlobalMax
 *   BunPlatform.createGlobalMax({
 *     installation: { engine: () => myEngine },
 *     workspace: { connectorRegistry: () => myRegistry },
 *     global: { workspaceRegistry: () => new InMemoryWorkspaceRegistry() },
 *   })
 */

import {
  type ConnectorRegistryConfig,
  type CredentialStoreConfig,
  DefaultSupervisor,
  DeployerRegistry,
  type EngineConfig,
  GlobalMax,
  InMemoryInstallationRegistry,
  type InstallationClient,
  InstallationClientProxy,
  InstallationDeployer,
  InstallationMax,
  InstallationRegistry,
  type InstallationRegistryConfig,
  type InstallationSpec,
  Platform,
  type PlatformName,
  type SyncMetaConfig,
  type TaskStoreConfig,
  type WorkspaceClient,
  WorkspaceClientProxy,
  WorkspaceMax,
  WorkspaceRegistry,
  type WorkspaceSpec,
  type WorkspaceInfo,
  type WorkspaceListEntry,
  type InstallationInfo,
} from '@max/federation'
import { Database } from 'bun:sqlite'
import {
  type Engine,
  ErrConfigNotSupported,
  InstallationId,
  NoOpFlowController,
  Printer,
  ResolverGraph,
  type ResolverFactories,
  type Supervisor,
  type SyncMeta,
} from '@max/core'
import {
  type ConnectorModuleAny,
  type ConnectorRegistry,
  type CredentialStore,
  InMemoryCredentialProvider,
  InMemoryCredentialStore,
} from '@max/connector'
import { SyncExecutor, type TaskStore } from '@max/execution'
import { DefaultTaskRunner, ExecutionRegistryImpl } from '@max/execution-local'
import path from 'node:path'
import { InProcessDeploymentConfig } from './deployers/types.js'
import { SqliteEngine } from '@max/storage-sqlite'
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from '@max/execution-sqlite'
import { BunConnectorRegistry } from './services/bun-connector-registry.js'
import { FsCredentialStore } from './services/fs-credential-store.js'
import { InMemorySyncMeta, InMemoryTaskStore } from '@max/execution-local'
import { FsInstallationRegistry } from './services/fs-installation-registry.js'
import { FsWorkspaceRegistry } from './services/fs-workspace-registry.js'
import { InProcessDeployer } from './deployers/general/inprocess-deployer.js'
import { DaemonDeployer } from './deployers/general/daemon-deployer.js'
import * as os from 'node:os'

// ============================================================================
// Constants
// ============================================================================

// FIXME: No hardcoded module map
const DEFAULT_MODULE_MAP: Record<string, string> = {
  acme: '@max/connector-acme',
  linear: '@max/connector-linear',
}

// ============================================================================
// Installation Graph
// ============================================================================

export interface InstallationGraphConfig {
  dataDir: string
  connector: ConnectorModuleAny
  engine?: EngineConfig
  credentials?: CredentialStoreConfig
  taskStore?: TaskStoreConfig
  syncMeta?: SyncMetaConfig
}

export interface InstallationGraphDeps {
  dbPath: string
  engine: Engine
  credentialStore: CredentialStore
  credentialProvider: InMemoryCredentialProvider
  taskStore: TaskStore
  syncMeta: SyncMeta
}

export const installationGraph = ResolverGraph.define<InstallationGraphConfig, InstallationGraphDeps>({
  dbPath: (c) => path.join(c.dataDir, 'data.db'),

  engine: (c, r) => {
    const cfg = c.engine ?? { type: 'sqlite' as const }
    const enginePath = cfg.type === 'in-memory' ? ':memory:' : (cfg.path ?? r.dbPath)
    const engine = SqliteEngine.open(enginePath, c.connector.def.schema)
    // FIXME: Should be a lifecycle responsibility of SqliteEngine
    SqliteExecutionSchema.ensureTables(engine.db)
    return engine
  },

  credentialStore: (c) => {
    const cfg = c.credentials ?? { type: 'fs' as const }
    if (cfg.type === 'in-memory') return new InMemoryCredentialStore(cfg.initialSecrets ?? {})
    return new FsCredentialStore(cfg.path ?? path.join(c.dataDir, 'credentials.json'))
  },

  // TODO: We need to configurize the credential provider
  credentialProvider: (_c, r) => new InMemoryCredentialProvider(r.credentialStore, []),

  taskStore: (c, r) => {
    const cfg = c.taskStore ?? { type: 'sqlite' as const }
    if (cfg.type === 'in-memory') return new InMemoryTaskStore()
    if (r.engine instanceof SqliteEngine) return new SqliteTaskStore(r.engine.db)
    return new SqliteTaskStore(Database.open(r.dbPath))
  },

  syncMeta: (c, r) => {
    const cfg = c.syncMeta ?? { type: 'sqlite' as const }
    if (cfg.type === 'in-memory') return new InMemorySyncMeta()
    if (r.engine instanceof SqliteEngine) return new SqliteSyncMeta(r.engine.db)
    return new SqliteSyncMeta(Database.open(r.dbPath))
  },
})

// ============================================================================
// Workspace Graph
// ============================================================================

export interface WorkspaceGraphConfig {
  dataDir: string
  installationRegistry?: InstallationRegistryConfig
  connectorRegistry?: ConnectorRegistryConfig
}

export interface WorkspaceGraphDeps {
  installationRegistry: InstallationRegistry
  connectorRegistry: ConnectorRegistry
  supervisor: Supervisor<any>
}

export const workspaceGraph = ResolverGraph.define<WorkspaceGraphConfig, WorkspaceGraphDeps>({
  installationRegistry: (c) => {
    const cfg = c.installationRegistry ?? { type: 'fs' as const }
    switch (cfg.type) {
      case 'in-memory':
        return new InMemoryInstallationRegistry()
      case 'fs': {
        const maxJsonPath = path.join(cfg.workspaceRoot ?? c.dataDir, 'max.json')
        return new FsInstallationRegistry(maxJsonPath)
      }
      default:
        throw ErrConfigNotSupported.create({ kind: 'installationRegistry', config: cfg })
    }
  },

  connectorRegistry: (c) => {
    const cfg = c.connectorRegistry ?? { type: 'hardcoded' as const }
    return new BunConnectorRegistry(cfg.moduleMap ?? DEFAULT_MODULE_MAP)
  },

  supervisor: () => new DefaultSupervisor(() => crypto.randomUUID() as InstallationId),
})

// ============================================================================
// Global Graph
// ============================================================================

export interface GlobalGraphConfig {
  rootDir?: string
}

export interface GlobalGraphDeps {
  root: string
  workspaceRegistry: WorkspaceRegistry
  supervisor: Supervisor<any>
}

export const globalGraph = ResolverGraph.define<GlobalGraphConfig, GlobalGraphDeps>({
  root: (c) => c.rootDir ?? path.join(os.homedir(), '.max'),
  workspaceRegistry: (_c, r) => new FsWorkspaceRegistry(r.root),
  supervisor: () => new DefaultSupervisor(() => crypto.randomUUID() as string),
})

// ============================================================================
// Platform Overrides
// ============================================================================

export interface PlatformOverrides {
  global?: Partial<ResolverFactories<GlobalGraphConfig, GlobalGraphDeps>>
  workspace?: Partial<ResolverFactories<WorkspaceGraphConfig, WorkspaceGraphDeps>>
  installation?: Partial<ResolverFactories<InstallationGraphConfig, InstallationGraphDeps>>
}

// ============================================================================
// Bootstrap Callbacks
// ============================================================================

function createInstallationBootstrap(graph: ResolverGraph<InstallationGraphConfig, InstallationGraphDeps>) {
  return async (
    config: InProcessDeploymentConfig,
    spec: InstallationSpec,
  ): Promise<InstallationClient> => {
    // Async: load connector (only truly async operation — everything else resolves synchronously)
    const cfg = config.connectorRegistry ?? { type: 'hardcoded' as const }
    const connectorRegistry = new BunConnectorRegistry(cfg.moduleMap ?? DEFAULT_MODULE_MAP)
    const connector = await connectorRegistry.resolve(spec.connector)

    // Sync: resolve all deps via graph
    const deps = graph.resolve({
      dataDir: config.dataDir,
      connector,
      engine: config.engine,
      credentials: config.credentials,
      taskStore: config.taskStore,
      syncMeta: config.syncMeta,
    })

    // Async: persist pre-collected credentials (from atomic connect flow)
    if (spec.initialCredentials) {
      for (const [key, value] of Object.entries(spec.initialCredentials)) {
        await deps.credentialStore.set(key, value)
      }
    }

    // Assemble the installation node
    // FIXME: We need to introduce a way to validate connectorConfig
    const installation = connector.initialise(spec.connectorConfig, deps.credentialProvider)
    const registry = new ExecutionRegistryImpl(connector.def.resolvers)
    const taskRunner = new DefaultTaskRunner({
      engine: deps.engine,
      syncMeta: deps.syncMeta,
      registry,
      flowController: new NoOpFlowController(),
      contextProvider: async () => installation.context,
    })
    const syncExecutor = new SyncExecutor({ taskRunner, taskStore: deps.taskStore })

    return new InstallationMax({
      connector: spec.connector,
      name: spec.name ?? 'default',
      schema: connector.def.schema,
      installation,
      seeder: connector.def.seeder,
      engine: deps.engine,
      syncExecutor,
    })
  }
}

function createWorkspaceBootstrap(
  graph: ResolverGraph<WorkspaceGraphConfig, WorkspaceGraphDeps>,
  installationDeployer: DeployerRegistry<InstallationDeployer>,
) {
  return async (
    config: InProcessDeploymentConfig,
    _spec: WorkspaceSpec,
  ): Promise<WorkspaceClient> => {
    const deps = graph.resolve({
      dataDir: config.dataDir,
      installationRegistry: config.installationRegistry,
      connectorRegistry: config.connectorRegistry,
    })

    return new WorkspaceMax({
      installationDeployer,
      installationSupervisor: deps.supervisor,
      connectorRegistry: deps.connectorRegistry,
      installationRegistry: deps.installationRegistry,
    })
  }
}

// ============================================================================
// Deployers
// ============================================================================

const daemonInstallationDeployer = new DaemonDeployer(
  (t) => new InstallationClientProxy(t),
  'installation'
)
const daemonWorkspaceDeployer = new DaemonDeployer((t) => new WorkspaceClientProxy(t), 'workspace')

function buildDeployerPipeline(overrides?: PlatformOverrides) {
  const iGraph = overrides?.installation ? installationGraph.with(overrides.installation) : installationGraph
  const instDeployer = new InProcessDeployer(createInstallationBootstrap(iGraph))
  const instRegistry = new DeployerRegistry('bun', [instDeployer, daemonInstallationDeployer])

  const wGraph = overrides?.workspace ? workspaceGraph.with(overrides.workspace) : workspaceGraph
  const wsDeployer = new InProcessDeployer(createWorkspaceBootstrap(wGraph, instRegistry))
  const wsRegistry = new DeployerRegistry('bun', [wsDeployer, daemonWorkspaceDeployer])

  return { instRegistry, wsRegistry, instDeployer, wsDeployer }
}

// Default pipeline (no overrides)
const defaultPipeline = buildDeployerPipeline()

// ============================================================================
// BunPlatform
// ============================================================================

export const BunPlatform = Platform.define({
  name: 'bun' as PlatformName,
  installation: {
    deploy: {
      inProcess: defaultPipeline.instDeployer.deployerKind,
      daemon: daemonInstallationDeployer.deployerKind,
    },
    registry: defaultPipeline.instRegistry,
  },
  workspace: {
    deploy: {
      inProcess: defaultPipeline.wsDeployer.deployerKind,
      daemon: daemonWorkspaceDeployer.deployerKind,
    },
    registry: defaultPipeline.wsRegistry,
  },
  printers: {
    "workspace-info": Printer.define<WorkspaceInfo>((ws, fmt) =>
      Printer.lines([
        fmt.underline(ws.name),
        `  ${fmt.normal('Id:')}    ${ws.id}`,
        `  ${fmt.normal('Since:')} ${ws.connectedAt}`,
      ])
    ),
    "workspace-list-entry": Printer.define<WorkspaceListEntry>((ws, fmt) => {
      const indicator =
        ws.health.status === 'healthy' ? fmt.green('●') :
        ws.health.status === 'degraded' ? fmt.yellow('●') :
        fmt.yellow('○')
      const label =
        ws.health.status === 'healthy' ? fmt.green('healthy') :
        ws.health.status === 'degraded' ? fmt.yellow(`degraded${ws.health.reason ? ` — ${ws.health.reason}` : ''}`) :
        fmt.yellow('not connected')
      return Printer.lines([
        fmt.underline(ws.name),
        `  ${fmt.normal('Id:')}     ${ws.id}`,
        `  ${fmt.normal('Status:')} ${indicator} ${label}`,
        `  ${fmt.normal('Since:')}  ${ws.connectedAt}`,
      ])
    }),
    "installation-info": Printer.define<InstallationInfo>((inst, fmt) =>
      Printer.lines([
        `${fmt.underline(inst.name)} ${fmt.dim(`[${inst.connector}]`)}`,
        `  ${fmt.normal('Id:')}    ${inst.id}`,
        `  ${fmt.normal('Since:')} ${inst.connectedAt}`,
      ])
    ),
  },
  general: {
    createSupervisor(): Supervisor<any> {
      return new DefaultSupervisor(() => crypto.randomUUID() as string)
    },
  },
  createGlobalMax(overrides?: PlatformOverrides) {
    const hasLevelOverrides = overrides?.workspace || overrides?.installation
    const gGraph = overrides?.global ? globalGraph.with(overrides.global) : globalGraph
    const deps = gGraph.resolve({})

    // Fast path: no workspace/installation overrides — use pre-built deployers
    if (!hasLevelOverrides) {
      return new GlobalMax({
        workspaceDeployer: this.workspace.registry,
        workspaceRegistry: deps.workspaceRegistry,
        workspaceSupervisor: deps.supervisor,
      })
    }

    // Rebuild the deployer pipeline with overridden graphs
    const pipeline = buildDeployerPipeline(overrides)
    return new GlobalMax({
      workspaceDeployer: pipeline.wsRegistry,
      workspaceRegistry: deps.workspaceRegistry,
      workspaceSupervisor: deps.supervisor,
    })
  },
})
