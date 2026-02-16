import { ProjectConfig } from '../config/project-config.js'
import { ManagedInstallation, PendingInstallation, ProjectManager } from '../project-manager/index.js'
import type { ConnectorRegistry, CredentialStore, OnboardingFlowAny } from '@max/connector'
import type { InstallationId, Schema } from '@max/core'
import { InstallationRuntimeImpl, type InstallationRuntime, type InstallationRuntimeInfo } from '../runtime/index.js'
import {ProjectDaemonManager} from "../project-daemon-manager/project-daemon-manager.js";

export interface PreparedConnection {
  readonly pending: PendingInstallation
  readonly credentialStore: CredentialStore
}

export interface MaxProjectAppDependencies {
  projectConfig: ProjectConfig
  projectManager: ProjectManager
  connectorRegistry: ConnectorRegistry
  daemonManager: ProjectDaemonManager
}

export class MaxProjectApp {
  private runtimes = new Map<InstallationId, InstallationRuntimeImpl>()

  constructor(private deps: MaxProjectAppDependencies) {}

  async getSchema(source: string): Promise<Schema> {
    const mod = await this.deps.connectorRegistry.resolve(source)
    return mod.def.schema
  }

  async getOnboardingFlow(source: string): Promise<OnboardingFlowAny> {
    const mod = await this.deps.connectorRegistry.resolve(source)
    return mod.def.onboarding
  }

  prepareConnection(source: string): PreparedConnection {
    const pending = this.deps.projectManager.prepare(source)
    const credentialStore = this.deps.projectManager.credentialStoreFor(pending)
    return { pending, credentialStore }
  }

  async commitConnection(pending: PendingInstallation, config: unknown): Promise<ManagedInstallation> {
    return this.deps.projectManager.commit(pending, config)
  }

  /** Expose relevant service interfaces */
  get connectorRegistry() {
    return this.deps.connectorRegistry
  }
  get projectManager() {
    return this.deps.projectManager
  }
  get daemonManager() {
    return this.deps.daemonManager
  }

  get config() {
    return this.deps.projectConfig
  }

  /** Get or create a runtime for the given installation. */
  async runtime(connector: string, name?: string): Promise<InstallationRuntime> {
    const managed = this.deps.projectManager.get(connector, name)

    const cached = this.runtimes.get(managed.id)
    if (cached) return cached

    const runtime = await InstallationRuntimeImpl.create({
      projectManager: this.deps.projectManager,
      connectorRegistry: this.deps.connectorRegistry,
      connector,
      name,
    })

    this.runtimes.set(managed.id, runtime)
    return runtime
  }

  /** List all currently active runtimes. */
  listRuntimes(): InstallationRuntimeInfo[] {
    return [...this.runtimes.values()].map((rt) => ({
      info: rt.info,
      startedAt: rt.startedAt,
    }))
  }

  /** Stop all active runtimes (for clean shutdown). */
  async stopAll(): Promise<void> {
    const stops = [...this.runtimes.values()].map((rt) => rt.lifecycle.stop())
    await Promise.all(stops)
    this.runtimes.clear()
  }
}
