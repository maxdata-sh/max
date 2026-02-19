/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceClient. Holds a Supervisor internally (not exposed on
 * the client surface). Registry persists installation metadata to max.json;
 * Supervisor manages live handles in memory and assigns identity.
 *
 * Routing: hosting.type → provider lookup → delegate. The workspace doesn't
 * interpret the spec — it passes it through to the provider.
 *
 * Creation flow:
 *   1. Deduplicate on natural key (connector + name)
 *   2. Route to provider via hosting.type (or default)
 *   3. Provider creates a live node → returns UnlabelledHandle
 *   4. Supervisor stamps it with an ID → returns NodeHandle
 *   5. Registry persists the entry
 *   6. Start the installation
 */

import {
  HealthStatus,
  StartResult,
  StopResult,
  ISODateString,
} from '@max/core'
import type { InstallationId } from '@max/core'
import type { InstallationClient } from "../protocols/installation-client.js"
import type { CreateInstallationConfig, ConnectInstallationConfig, WorkspaceClient } from "../protocols/workspace-client.js"
import type { InstallationInfo } from "../project-manager/types.js"
import type { HostingType } from "../config/hosting-config.js"
import { InstallationSupervisor } from "./supervisors.js"
import { InstallationRegistry } from "./installation-registry.js"
import { InstallationNodeProvider } from "../providers/installation-node-provider.js"
import { ErrInstallationAlreadyExists } from "../project-manager/errors.js"
import { ErrProviderNotFound } from "../errors/errors.js"

export type WorkspaceMaxConstructable = {
  installationSupervisor: InstallationSupervisor
  registry: InstallationRegistry
  providers: Map<HostingType, InstallationNodeProvider>
  defaultHostingType: HostingType
}

export class WorkspaceMax implements WorkspaceClient {
  private readonly supervisor: InstallationSupervisor
  private registry: InstallationRegistry
  private readonly providers: Map<HostingType, InstallationNodeProvider>
  private readonly defaultHostingType: HostingType

  constructor(args: WorkspaceMaxConstructable) {
    this.supervisor = args.installationSupervisor
    this.registry = args.registry
    this.providers = args.providers
    this.defaultHostingType = args.defaultHostingType
  }

  async listInstallations(): Promise<InstallationInfo[]> {
    const items = this.registry.list()
    return items.map(
      (item): InstallationInfo => ({
        connector: item.connector,
        name: item.name,
        id: item.id,
        connectedAt: item.connectedAt,
        location: item.location
      })
    )
  }

  installation(id: InstallationId): InstallationClient | undefined {
    return this.supervisor.get(id)?.client
  }

  async createInstallation(config: CreateInstallationConfig): Promise<InstallationId> {
    const { spec } = config
    const name = spec.name ?? spec.connector

    // 1. Deduplicate on natural key (connector + name)
    const existing = this.registry.list().find(
      (e) => e.connector === spec.connector && e.name === name
    )
    if (existing) {
      throw ErrInstallationAlreadyExists.create({ connector: spec.connector, name })
    }

    // 2. Route to provider via hosting.type (or workspace default)
    const hostingType = config.hosting?.type ?? this.defaultHostingType
    const provider = this.resolveProvider(hostingType)

    // 3. Provider creates a live node (stateless, returns UnlabelledHandle)
    const unlabelled = await provider.create(spec)

    // 4. Supervisor assigns identity, returns NodeHandle
    const handle = this.supervisor.register(unlabelled)

    // 5. Persist to registry
    this.registry.add({
      id: handle.id,
      connector: spec.connector,
      name,
      connectedAt: ISODateString.now(),
      providerKind: handle.providerKind,
      location: null,
    })

    // 6. Start
    await handle.client.start()

    return handle.id
  }

  async connectInstallation(config: ConnectInstallationConfig): Promise<InstallationId> {
    const provider = this.resolveProvider(config.hosting.type)

    // Connect to the remote node
    const unlabelled = await provider.connect(config.hosting)

    // Ask the node to describe itself — connector, name, schema
    const description = await unlabelled.client.describe()

    // Supervisor assigns identity
    const handle = this.supervisor.register(unlabelled)

    // Persist with real metadata from the node itself
    this.registry.add({
      id: handle.id,
      connector: description.connector,
      name: config.name ?? description.name,
      connectedAt: ISODateString.now(),
      providerKind: handle.providerKind,
      location: config.hosting.url,
    })

    return handle.id
  }

  async removeInstallation(id: InstallationId): Promise<void> {
    this.supervisor.unregister(id)
    this.registry.remove(id)
  }

  async health() {
    const aggregate = await this.supervisor.health()
    return HealthStatus[aggregate.status](
      aggregate.status !== 'healthy'
        ? `${aggregate.children.size} installation(s) checked`
        : undefined
    )
  }

  async start(): Promise<StartResult> {
    const handles = this.supervisor.list()
    for (const handle of handles) {
      const result = await handle.client.start()
      // FIXME: We need to log / throw errors if start has failures
      if (result.outcome === 'error' || result.outcome === 'refused'){
        const reason = result.outcome === 'error' ? result.error : result.reason
        console.warn(`Failed to start installation handle=${handle.id} for provider=${handle.providerKind}`, reason)
      }else{
        console.log(`Started installation ${handle.id} successfully`)
      }
    }
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    const handles = this.supervisor.list()
    for (let i = handles.length - 1; i >= 0; i--) {
      await handles[i].client.stop()
    }
    return StopResult.stopped()
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private resolveProvider(hostingType: HostingType): InstallationNodeProvider {
    const provider = this.providers.get(hostingType)
    if (!provider) {
      throw ErrProviderNotFound.create({ hostingType })
    }
    return provider
  }
}
