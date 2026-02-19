/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceClient. Holds a Supervisor internally (not exposed on
 * the client surface). Registry persists installation metadata to max.json;
 * Supervisor manages live handles in memory and assigns identity.
 *
 * Creation flow:
 *   1. Deduplicate on natural key (connector + name)
 *   2. Provider creates a live node → returns UnlabelledHandle
 *   3. Supervisor stamps it with an ID → returns NodeHandle
 *   4. Registry persists the entry
 *   5. Start the installation
 */

import {
  HealthStatus,
  StartResult,
  StopResult,
  ISODateString,
  Scope,
} from '@max/core'
import type { InstallationId } from '@max/core'
import type { InstallationClient } from "../protocols/installation-client.js"
import type { CreateInstallationConfig, WorkspaceClient } from "../protocols/workspace-client.js"
import type { InstallationInfo } from "../project-manager/types.js"
import { InstallationSupervisor } from "./supervisors.js"
import { InstallationRegistry } from "./installation-registry.js"
import { InstallationNodeProvider } from "../providers/installation-node-provider.js"
import { ErrInstallationAlreadyExists } from "../project-manager/errors.js"

export type WorkspaceMaxConstructable = {
  installationSupervisor: InstallationSupervisor
  registry: InstallationRegistry
  installationProvider: InstallationNodeProvider
}

export class WorkspaceMax implements WorkspaceClient {
  private readonly supervisor: InstallationSupervisor
  private registry: InstallationRegistry
  private installationProvider: InstallationNodeProvider

  constructor(args: WorkspaceMaxConstructable) {
    this.supervisor = args.installationSupervisor
    this.registry = args.registry
    this.installationProvider = args.installationProvider
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
    const name = config.name ?? config.connector

    // 1. Deduplicate on natural key (connector + name)
    const existing = this.registry.list().find(
      (e) => e.connector === config.connector && e.name === name
    )
    if (existing) {
      throw ErrInstallationAlreadyExists.create({ connector: config.connector, name })
    }

    // 2. Provider creates a live node (stateless, returns UnlabelledHandle)
    const unlabelled = await this.installationProvider.create({
      scope: Scope.workspace("pending" as InstallationId),
      value: config
    })

    // 3. Supervisor assigns identity, returns NodeHandle
    const handle = this.supervisor.register(unlabelled)

    // 4. Persist to registry
    this.registry.add({
      id: handle.id,
      connector: config.connector,
      name,
      connectedAt: ISODateString.now(),
      providerKind: handle.providerKind,
      location: null,
    })

    // 5. Start
    await handle.client.start()

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
}
