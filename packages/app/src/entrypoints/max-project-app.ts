import { ProjectConfig } from '../config/project-config.js'
import { ManagedInstallation, PendingInstallation, ProjectManager } from '../project-manager/index.js'
import type { ConnectorRegistry, CredentialStore, OnboardingFlowAny } from '@max/connector'
import type { Schema } from '@max/core'
import { ProjectDaemonManager } from '../project-daemon-manager.js'

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
}
