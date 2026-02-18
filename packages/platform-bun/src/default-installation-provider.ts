import { NoOpFlowController, ScopedResource, WorkspaceScope } from '@max/core'
import { ConnectorRegistry, InMemoryCredentialProvider } from '@max/connector'
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from '@max/execution-sqlite'
import { DefaultTaskRunner, ExecutionRegistryImpl } from '@max/execution-local'
import { SqliteEngine } from '@max/storage-sqlite'
import { SyncExecutor } from '@max/execution'
import { InstallationMax, ProjectManager } from '@max/federation'

type Deps = {
  projectManager: ProjectManager
  connectorRegistry: ConnectorRegistry
  connector: string
  name?: string
}
type ScopedDeps = ScopedResource<Deps, WorkspaceScope>

/**
 * Out-of-the-box basic bun / local implementation:
 *  - SQLite engine
 *  - SQLite task executor
 *  - InMemory credentials (this won't last long...)
 *
 *  To extend this - increase the surface area of Deps - pass in the dependencies you need.
 *
 */
export async function createInstallationInProcess(input: ScopedDeps): Promise<InstallationMax> {
  const { name, connector: connectorName, projectManager, connectorRegistry } = input.value

  const managedInstallation = projectManager.get(connectorName, name)

  // Resolve connector module
  const connector = await connectorRegistry.resolve(connectorName)
  const credStore = projectManager.credentialStoreFor(managedInstallation)

  // FIXME: I'm not convinced by this. We need to talk about the relationship between credential _store_ and credential provider.
  // The empty array there is looking for trouble
  const credentials = new InMemoryCredentialProvider(credStore, [])

  // Initialise connector → live Installation
  const installation = connector.initialise(managedInstallation.config, credentials)

  // FIXME: We need to carve out something that provides config to an "engine provider"
  // Open SQLite DB + engine
  const dbPath = projectManager.dataPathFor(managedInstallation)
  const engine = SqliteEngine.open(dbPath, connector.def.schema)

  // FIXME: This wiring should be something that lives in execution-sqlite - we shouldn't have to create these manually
  // Ensure execution tables + stores
  new SqliteExecutionSchema().ensureTables(engine.db)
  const syncMeta = new SqliteSyncMeta(engine.db)
  const taskStore = new SqliteTaskStore(engine.db)

  // Build execution registry from connector resolvers
  const registry = new ExecutionRegistryImpl(connector.def.resolvers)

  // Construct task runner
  const taskRunner = new DefaultTaskRunner({
    engine,
    syncMeta,
    registry,
    flowController: new NoOpFlowController(),
    contextProvider: async () => installation.context,
  })

  const syncExecutor = new SyncExecutor({ taskRunner, taskStore })

  const installationMax = new InstallationMax({
    // FIXME: Maybe we should just pass a connector module to the installation?
    // I think it would obviate these three fields
    schema: connector.def.schema,
    installation: installation,
    seeder: connector.def.seeder,
    syncExecutor: syncExecutor,
    engine,
  })
  return installationMax
}
