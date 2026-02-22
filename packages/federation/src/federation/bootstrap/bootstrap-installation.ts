/**
 * bootstrapInstallation — Pure wiring function.
 *
 * Takes fully resolved, concrete dependencies and assembles a working
 * InstallationMax. No filesystem access, no platform imports, no config
 * resolution. Just assembly.
 *
 * Resolution (spec → concrete deps) is the provider's job.
 * Wiring (concrete deps → working InstallationMax) is bootstrap's job.
 */

import {
  type ConnectorVersionIdentifier,
  type Engine,
  type SyncMeta,
  NoOpFlowController,
} from '@max/core'
import type { ConnectorModuleAny, CredentialProvider, CredentialStore } from '@max/connector'
import { InMemoryCredentialProvider } from '@max/connector'
import { SyncExecutor, type TaskStore } from '@max/execution'
import { DefaultTaskRunner, ExecutionRegistryImpl } from '@max/execution-local'
import { InstallationMax } from '../installation-max.js'

// ============================================================================
// ResolvedInstallationDeps
// ============================================================================

/**
 * Everything needed to wire a working InstallationMax.
 * All dependencies are concrete, resolved implementations — no abstract config.
 */
export interface ResolvedInstallationDeps {
  /** Full identifier for the connector */
  connectorVersionIdentifier: ConnectorVersionIdentifier

  /** Installation name/slug. For describe(). */
  name: string

  /** Resolved connector module — provides schema, seeder, resolvers, initialise(). */
  connector: ConnectorModuleAny

  /** Ready-to-use query engine. */
  engine: Engine

  /** Ready-to-use credential provider. */
  credentialProvider: CredentialProvider

  /** Ready-to-use task store for sync execution. */
  taskStore: TaskStore

  /** Ready-to-use sync metadata tracker. */
  syncMeta: SyncMeta

  /** Connector-specific config passed to connector.initialise(). Opaque. */
  connectorConfig?: unknown
}

// ============================================================================
// Bootstrap
// ============================================================================

// TODO: I'm not convinced we need this. I think it's reasonable to expect the Platform to produce its own InstallationMax
export function bootstrapInstallation(deps: ResolvedInstallationDeps): InstallationMax {
  const credentials = deps.credentialProvider

  // FIXME: We need to introduce a way to validate connectorConfig
  const installation = deps.connector.initialise(deps.connectorConfig, credentials)

  const registry = new ExecutionRegistryImpl(deps.connector.def.resolvers)

  const taskRunner = new DefaultTaskRunner({
    engine: deps.engine,
    syncMeta: deps.syncMeta,
    registry,
    flowController: new NoOpFlowController(),
    contextProvider: async () => installation.context,
  })

  const syncExecutor = new SyncExecutor({ taskRunner, taskStore: deps.taskStore })

  return new InstallationMax({
    connector: deps.connectorVersionIdentifier,
    name: deps.name,
    schema: deps.connector.def.schema,
    installation,
    seeder: deps.connector.def.seeder,
    engine: deps.engine,
    syncExecutor,
  })
}
