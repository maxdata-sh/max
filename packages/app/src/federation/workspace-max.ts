/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceClient. Holds a Supervisor internally (not exposed on
 * the client surface). Real implementation of listInstallations,
 * createInstallation, and removeInstallation requires a Registry and
 * NodeProvider wiring — deferred to a follow-up task.
 */

import {
  ErrNotImplemented,
  HealthStatus,
  StartResult,
  StopResult,
  type InstallationId,
  type Supervisor, ISODateString,
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

  async createInstallation(config: CreateInstallationConfig): Promise<InstallationClient> {
    const result = await this.installationProvider.create(config)
    // FIXME: CLAUDE: We need a connector-def style serialisable object here, schema isn't enough
    // I've left some notes for myself as to how to approach this
    // For now, the information we give back here is incomplete
    const schema = await result.client.schema()
    this.registry.add({
      id: result.id,
      connector: `standin:@max/${schema.namespace}`, // <- we can't get this from schema
      name: `standin:${schema.namespace}-default`, // <- we can't get this yet
      connectedAt: ISODateString.now(),
      providerKind: this.installationProvider.kind,
      location: 'standin:unknown-location', // <- i think we need the installationProvider to give us one
    })
    this.supervisor.register(result)
    return result.client
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
