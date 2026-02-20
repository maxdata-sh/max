/**
 * BunInProcessWorkspaceProvider — Bootstraps a WorkspaceMax from a project root.
 *
 * Assembles all the pieces needed for a filesystem-backed workspace:
 * connector registry, installation registry (max.json), installation
 * providers, and supervisor. The resulting WorkspaceMax lives in-process
 * with the caller (typically the daemon process).
 *
 * This is the "missing link" between GlobalMax.createWorkspace() and
 * a real, working workspace backed by a project directory.
 */

import * as path from 'node:path'
import {
  type InstallationId,
  type ProviderKind,
  type UnlabelledHandle,
} from '@max/core'
import type { ConnectorRegistry } from '@max/connector'
import {
  DefaultSupervisor,
  WorkspaceMax,
  type WorkspaceClient,
  type WorkspaceNodeProvider,
  type HostingStrategy,
  type InstallationNodeProvider,
  type InstallationClient,
} from '@max/federation'
import { FsInstallationRegistry } from './fs-installation-registry.js'
import { BunConnectorRegistry } from './bun-connector-registry.js'
import { BunInProcessInstallationProvider } from './bun-in-process-installation-provider.js'

const BUN_WORKSPACE_KIND: ProviderKind = 'in-process'

export interface BunWorkspaceConfig {
  /** Project root path (directory containing max.json and .max/). */
  readonly projectRoot: string
  /** Connector module map (name → import path). */
  readonly connectors: Record<string, string>
}

export class BunInProcessWorkspaceProvider implements WorkspaceNodeProvider<BunWorkspaceConfig> {
  readonly kind = BUN_WORKSPACE_KIND

  async create(config: BunWorkspaceConfig): Promise<UnlabelledHandle<WorkspaceClient>> {
    const { projectRoot, connectors } = config
    const maxJsonPath = path.join(projectRoot, 'max.json')
    const dataRoot = path.join(projectRoot, '.max', 'installations')

    // -- Connector registry --
    const connectorRegistry: ConnectorRegistry = new BunConnectorRegistry(connectors)

    // -- Installation registry (backed by max.json) --
    const installationRegistry = new FsInstallationRegistry(maxJsonPath)

    // -- Installation providers --
    const installationProvider = new BunInProcessInstallationProvider(connectorRegistry, dataRoot)
    const providers = new Map<HostingStrategy, InstallationNodeProvider>([
      ['in-process', installationProvider],
    ])

    // -- Installation supervisor --
    const installationSupervisor = new DefaultSupervisor<InstallationClient, InstallationId>(
      () => crypto.randomUUID() as InstallationId
    )

    // -- Assemble workspace --
    const workspace = new WorkspaceMax({
      installationSupervisor,
      registry: installationRegistry,
      providers,
      defaultHostingStrategy: 'in-process',
      platformName: 'bun',
      connectorRegistry,
    })

    return { providerKind: BUN_WORKSPACE_KIND, client: workspace }
  }

  async connect(_location: unknown): Promise<UnlabelledHandle<WorkspaceClient>> {
    throw new Error('BunInProcessWorkspaceProvider does not support connect()')
  }
}
