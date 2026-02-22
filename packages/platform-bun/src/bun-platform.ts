/**
 * BunPlatform — Strongly-typed entry point for the Bun platform.
 *
 * Exposes typed deploy constants and deployer registries for workspace and
 * installation hosting. Deploy constants carry phantom config types for
 * compile-time type safety; registries handle runtime deployer lookup.
 *
 * Usage:
 *   import { BunPlatform } from "@max/platform-bun"
 *
 *   BunPlatform.workspace.deploy.inProcess   // → DeployerKind<InProcessDeploymentConfig>
 *   BunPlatform.installation.deploy.daemon   // → DeployerKind<DaemonDeploymentConfig>
 *   BunPlatform.installation.registry.get(kind) // → runtime deployer lookup
 */

import {
  bootstrapInstallation,
  bootstrapWorkspace,
  ConnectorRegistryConfig,
  CredentialStoreConfig,
  DefaultSupervisor,
  DeployerRegistry,
  EngineConfig,
  GlobalMax,
  InMemoryInstallationRegistry,
  InstallationClient,
  InstallationClientProxy,
  InstallationRegistry,
  InstallationRegistryConfig,
  InstallationSpec,
  Platform,
  type PlatformName,
  ResolvedConnectorRegistryConfig,
  ResolvedCredentialStoreConfig,
  ResolvedEngineConfig,
  ResolvedInstallationRegistryConfig,
  ResolvedSyncMetaConfig,
  ResolvedTaskStoreConfig,
  SyncMetaConfig,
  TaskStoreConfig,
  WorkspaceClient,
  WorkspaceClientProxy,
  WorkspaceRegistry,
  WorkspaceSpec,
} from '@max/federation'
import { Database } from 'bun:sqlite'
import {
  Engine,
  ErrConfigNotSupported,
  ErrNotSupported,
  InstallationId,
  Schema,
  Supervisor,
  SyncMeta,
} from '@max/core'
import {
  ConnectorRegistry,
  CredentialStore,
  InMemoryCredentialProvider,
  InMemoryCredentialStore,
} from '@max/connector'
import { TaskStore } from '@max/execution'
import path from 'node:path'
import { type AsyncResolver, Resolver } from './to-move-to-core.js'
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

interface InstallationResolvers {
  engine: AsyncResolver<{ config: ResolvedEngineConfig; schema: Schema }, Engine>
  credentialStore: Resolver<ResolvedCredentialStoreConfig, CredentialStore>
  connectorRegistry: Resolver<ResolvedConnectorRegistryConfig, ConnectorRegistry>
  // TODO: Currently, we only support sqlite engine. TaskStore and SyncMeta reach into it
  taskStore: Resolver<{ config: ResolvedTaskStoreConfig; db: Resolver<void, Database> }, TaskStore>
  syncMeta: Resolver<{ config: ResolvedSyncMetaConfig; db: Resolver<void, Database> }, SyncMeta>
}

interface WorkspaceResolvers {
  engine: Resolver<ResolvedEngineConfig, Engine>
  installationRegistry: Resolver<ResolvedInstallationRegistryConfig, InstallationRegistry>
  connectorRegistry: Resolver<ResolvedConnectorRegistryConfig, ConnectorRegistry>
}

interface GlobalResolvers {
  workspaceRegistry: Resolver<string, WorkspaceRegistry>
}

interface ConfigResolvers {
  fallbackDbPath: Resolver<void, string>
  engine: Resolver<EngineConfig, ResolvedEngineConfig>
  credentialStore: Resolver<CredentialStoreConfig, ResolvedCredentialStoreConfig>
  connectorRegistry: Resolver<ConnectorRegistryConfig, ResolvedConnectorRegistryConfig>
  installationRegistry: Resolver<InstallationRegistryConfig, ResolvedInstallationRegistryConfig>
  taskStore: Resolver<TaskStoreConfig, ResolvedTaskStoreConfig>
  syncMeta: Resolver<SyncMetaConfig, ResolvedSyncMetaConfig>
}

interface BunResolvers {
  configure: Resolver<InProcessDeploymentConfig, ConfigResolvers>
  installation: InstallationResolvers
  workspace: WorkspaceResolvers
  global: GlobalResolvers
}

function createWorkspaceBootstrap(resolvers: BunResolvers) {
  return async (
    config: InProcessDeploymentConfig,
    spec: WorkspaceSpec
  ): Promise<WorkspaceClient> => {
    const configure = resolvers.configure.resolve(config)
    const installationRegistryConfig = configure.installationRegistry.resolve(
      spec.installationRegistry ?? { type: 'fs' }
    )
    const connectorRegistryConfig = configure.connectorRegistry.resolve(
      config.connectorRegistry ?? { type: 'hardcoded' }
    )

    const installationRegistry = resolvers.workspace.installationRegistry.resolve(
      installationRegistryConfig
    )
    const connectorRegistry = resolvers.workspace.connectorRegistry.resolve(connectorRegistryConfig)

    return bootstrapWorkspace({
      platform: BunPlatform,
      installationRegistry,
      connectorRegistry,
      installationSupervisor: new DefaultSupervisor(() => crypto.randomUUID() as InstallationId),
    })
  }
}

function createInstallationBootstrap(resolvers: BunResolvers) {
  return async (
    config: InProcessDeploymentConfig,
    spec: InstallationSpec
  ): Promise<InstallationClient> => {
    const configure = resolvers.configure.resolve(config)

    const engineConfig = configure.engine.resolve(config.engine ?? { type: 'sqlite' })
    const credConfig = configure.credentialStore.resolve(config.credentials ?? { type: 'fs' })
    const taskStoreConfig = configure.taskStore.resolve(config.taskStore ?? { type: 'sqlite' })
    const syncMetaConfig = configure.taskStore.resolve(config.syncMeta ?? { type: 'sqlite' })

    const connectorRegistryConfig = configure.connectorRegistry.resolve(
      config.connectorRegistry ?? { type: 'hardcoded' }
    )

    const installation = resolvers.installation

    // NIT: This is a bit circuitous - we only have one connector at this point
    const connectorRegistry = installation.connectorRegistry.resolve(connectorRegistryConfig)
    const connector = await connectorRegistry.resolve(spec.connector)
    const schema = connector.def.schema

    // 2. Resolve implementations
    const engine = await installation.engine.resolve({ config: engineConfig, schema })
    const credentialStore = installation.credentialStore.resolve(credConfig)

    // TODO: We need to configurize the credential provider
    const credentialProvider = new InMemoryCredentialProvider(credentialStore, [])

    // If we already have a database via the engine, use that. Otherwise, fall back to one
    const metaDbResolver = Resolver.create(() => {
      if (engine instanceof SqliteEngine) {
        return engine.db
      } else {
        const path = configure.fallbackDbPath.resolve()
        return Database.open(path)
      }
    })

    const taskStore = installation.taskStore.resolve({
      config: taskStoreConfig,
      db: metaDbResolver,
    })
    const syncMeta = installation.syncMeta.resolve({
      config: syncMetaConfig,
      db: metaDbResolver,
    })

    // Persist pre-collected credentials (from atomic connect flow)
    if (spec.initialCredentials) {
      for (const [key, value] of Object.entries(spec.initialCredentials)) {
        await credentialStore.set(key, value)
      }
    }

    // 3. Wire together (platform-invariant)
    return bootstrapInstallation({
      connector,
      connectorConfig: spec.connectorConfig,
      connectorVersionIdentifier: spec.connector,
      name: spec.name ?? 'default',
      engine,
      credentialProvider,
      taskStore,
      syncMeta,
    })
  }
}

const configureResolvers = Resolver.create((config: InProcessDeploymentConfig): ConfigResolvers => {
  const defaultDbPath = path.join(config.dataDir, 'data.db')
  return {
    engine: Resolver.create((e) => {
      return e.type === 'in-memory'
        ? { type: 'sqlite', path: ':memory:' }
        : {
            type: 'sqlite',
            path: e.path ?? defaultDbPath,
          }
    }),
    credentialStore: Resolver.create((e): ResolvedCredentialStoreConfig => {
      return e.type === 'in-memory'
        ? { type: 'in-memory', initialSecrets: e.initialSecrets ?? {} }
        : {
            type: 'fs',
            path: e.path ?? path.join(config.dataDir, 'credentials.json'),
          }
    }),
    connectorRegistry: Resolver.create((e) => {
      return {
        type: e.type,
        // FIXME: No hardcoded
        moduleMap: e.moduleMap ?? {
          acme: '@max/connector-acme',
          linear: '@max/connector-acme',
        },
      }
    }),
    installationRegistry: Resolver.create((e) => {
      switch (e.type) {
        case 'in-memory':
          return e
        case 'fs': {
          const maxJsonPath = path.join(e.workspaceRoot ?? config.dataDir, 'max.json')
          return { type: 'max-json', maxJsonPath }
        }
        default:
          throw ErrConfigNotSupported.create({ kind: 'installationRegistry', config: e })
      }
    }),
    fallbackDbPath: Resolver.create(() => defaultDbPath),
    taskStore: Resolver.create((c) => {
      return c.type === 'in-memory' ? c : { type: 'sqlite', dbPath: c.dbPath ?? defaultDbPath }
    }),
    syncMeta: Resolver.create((c) => {
      return c.type === 'in-memory' ? c : { type: 'sqlite', dbPath: c.dbPath ?? defaultDbPath }
    }),
  }
})

const installationResolvers: InstallationResolvers = {
  engine: Resolver.async(async (e) => {
    const engine = SqliteEngine.open(e.config.path, e.schema)
    // FIXME: This should just be a lifecycle responsibility of sqlite engine
    SqliteExecutionSchema.ensureTables(engine.db)
    return engine
  }),
  connectorRegistry: Resolver.create((c) => {
    return new BunConnectorRegistry(c.moduleMap)
  }),
  credentialStore: Resolver.create((c) => {
    switch (c.type) {
      case 'in-memory':
        return new InMemoryCredentialStore(c.initialSecrets)
      case 'fs':
        return new FsCredentialStore(c.path)
      default:
        throw ErrConfigNotSupported.create({ kind: 'credentialStore', config: c })
    }
  }),
  syncMeta: Resolver.create((c) => {
    switch (c.config.type) {
      case 'in-memory':
        return new InMemorySyncMeta()
      case 'sqlite':
        return new SqliteSyncMeta(c.db.resolve())
      default:
        throw ErrConfigNotSupported.create({ kind: 'syncMeta', config: c })
    }
  }),
  taskStore: Resolver.create((c) => {
    switch (c.config.type) {
      case 'in-memory':
        return new InMemoryTaskStore()
      case 'sqlite':
        return new SqliteTaskStore(c.db.resolve())
      default:
        throw ErrConfigNotSupported.create({ kind: 'taskStore', config: c })
    }
  }),
}

const workspaceResolvers: WorkspaceResolvers = {
  engine: Resolver.create((e): Engine => {
    throw ErrNotSupported.create({}, 'Workspace engine not yet supported')
  }),
  installationRegistry: Resolver.create((c) => {
    switch (c.type) {
      case 'in-memory':
        return new InMemoryInstallationRegistry()
      case 'max-json':
        return new FsInstallationRegistry(c.maxJsonPath)
    }
  }),
  connectorRegistry: Resolver.create((c) => {
    switch (c.type) {
      case 'hardcoded':
        return new BunConnectorRegistry(c.moduleMap)
    }
  }),
}

const globalResolvers: GlobalResolvers = {
  workspaceRegistry: Resolver.create((root) => {
    return new FsWorkspaceRegistry(root)
  }),
}

const resolvers: BunResolvers = {
  configure: configureResolvers,
  installation: installationResolvers,
  workspace: workspaceResolvers,
  global: globalResolvers,
}

const inProcessInstallationDeployer = new InProcessDeployer(createInstallationBootstrap(resolvers))
const daemonInstallationDeployer = new DaemonDeployer(
  (t) => new InstallationClientProxy(t),
  'installation'
)

const inProcessWorkspaceDeployer = new InProcessDeployer(createWorkspaceBootstrap(resolvers))
const daemonWorkspaceDeployer = new DaemonDeployer((t) => new WorkspaceClientProxy(t), 'workspace')

export const BunPlatform = Platform.define({
  name: 'bun' as PlatformName,
  installation: {
    deploy: {
      inProcess: inProcessInstallationDeployer.deployerKind,
      daemon: daemonInstallationDeployer.deployerKind,
    },
    registry: new DeployerRegistry('bun', [
      inProcessInstallationDeployer,
      daemonInstallationDeployer,
    ]),
  },
  workspace: {
    deploy: {
      inProcess: inProcessWorkspaceDeployer.deployerKind,
      daemon: daemonWorkspaceDeployer.deployerKind,
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
