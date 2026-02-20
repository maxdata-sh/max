/**
 * WorkspaceClientProxy — Caller-side proxy for WorkspaceClient.
 *
 * Composes SupervisedProxy for lifecycle methods. Workspace-specific methods
 * (listInstallations, createInstallation, removeInstallation) are direct RPCs.
 *
 * installation(id) returns an InstallationClientProxy wrapped in a
 * ScopedTransport that adds { installationId: id } to every request.
 */

import {
  SupervisedProxy,
  type Transport,
  type RpcRequest,
  type InstallationId,
  type Schema,
  type HealthStatus,
  type StartResult,
  type StopResult,
} from "@max/core"
import type { ConnectorRegistryEntry, OnboardingFlowAny } from "@max/connector"
import type { InstallationInfo } from "../federation/installation-registry.js"
import type { InstallationClient } from "./installation-client.js"
import type { CreateInstallationConfig, ConnectInstallationConfig, WorkspaceClient } from "./workspace-client.js"
import { InstallationClientProxy } from "./installation-client-proxy.js"
import { ScopedTransport } from "./scoped-transport.js"

export class WorkspaceClientProxy implements WorkspaceClient {
  private readonly supervised: SupervisedProxy

  constructor(private readonly transport: Transport) {
    this.supervised = new SupervisedProxy(transport)
  }

  health(): Promise<HealthStatus> {
    return this.supervised.health()
  }

  start(): Promise<StartResult> {
    return this.supervised.start()
  }

  stop(): Promise<StopResult> {
    return this.supervised.stop()
  }

  async listInstallations(): Promise<InstallationInfo[]> {
    return this.rpc("listInstallations")
  }

  installation(id: InstallationId): InstallationClient | undefined {
    // Returns a proxy routed through this workspace's transport.
    // Every request from this proxy carries scope.installationId.
    const scopedTransport = new ScopedTransport(this.transport, { installationId: id })
    return new InstallationClientProxy(scopedTransport)
  }

  // FIXME: I think the "Workspace" domain needs a view on an InstallationClient that extends the client with the installation's metadata. It will be unnecessarily cumbersome without it
  // For now, i'm working around it.
  // Actually, on further reflection - this is simply a case of Scope-aware clients. We need an InstallationClient<WorkspaceScope> (or some variant on that concept)
  async createInstallation(config: CreateInstallationConfig): Promise<InstallationId> {
    return this.rpc('createInstallation', config)
  }

  async connectInstallation(config: ConnectInstallationConfig): Promise<InstallationId> {
    return this.rpc('connectInstallation', config)
  }

  async removeInstallation(id: InstallationId): Promise<void> {
    return this.rpc("removeInstallation", id)
  }

  async listConnectors(): Promise<ConnectorRegistryEntry[]> {
    return this.rpc("listConnectors")
  }

  async connectorSchema(connector: string): Promise<Schema> {
    return this.rpc("connectorSchema", connector)
  }

  async connectorOnboarding(connector: string): Promise<OnboardingFlowAny> {
    return this.rpc("connectorOnboarding", connector)
  }

  private rpc(method: string, ...args: unknown[]): Promise<any> {
    const request: RpcRequest = { id: crypto.randomUUID(), target: "", method, args }
    return this.transport.send(request)
  }
}
