/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceClient. Holds a Supervisor internally (not exposed on
 * the client surface). Registry persists installation metadata to max.json;
 * Supervisor manages live handles in memory.
 */

import {
  HealthStatus,
  StartResult,
  StopResult,
  ISODateString,
  type InstallationId,
} from "@max/core"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { CreateInstallationConfig, WorkspaceClient } from "../protocols/workspace-client.js"
import type { InstallationInfo } from "../project-manager/types.js"
import {InstallationSupervisor} from "./supervisors.js";
import {InstallationRegistry} from "./installation-registry.js";
import {InstallationNodeProvider} from "../providers/installation-node-provider.js";

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
    const items = await this.registry.list()
    return items.map(
      (item): InstallationInfo => ({
        connector: item.connector,
        name: item.name,
        id: item.id,
        connectedAt: item.connectedAt,
      })
    )
  }

  installation(id: InstallationId): InstallationClient | undefined {
    return this.supervisor.get(id)?.client
  }

  async createInstallation(config: CreateInstallationConfig): Promise<InstallationId> {
    const result = await this.installationProvider.create(config)
    this.registry.add({
      id: result.id,
      connector: config.connector,
      name: config.name ?? config.connector,
      connectedAt: ISODateString.now(),
      providerKind: config.providerKind ?? this.installationProvider.kind,
      location: null, // provider-supplied location — deferred until boot sequence
    })
    this.supervisor.register(result)
    return result.id
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
      await handle.client.start()
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
