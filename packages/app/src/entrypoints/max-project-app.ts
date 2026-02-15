import { ProjectConfig } from '../config/project-config.js'
import { ManagedInstallation, ProjectManager } from '../project-manager/index.js'
import type { ConnectorRegistry } from '@max/connector'
import { ErrNotImplemented, Schema } from '@max/core'
import { ProjectDaemonManager } from '../project-daemon-manager.js'

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

  async connect(source: string): Promise<ManagedInstallation> {
    const mod = await this.deps.connectorRegistry.resolve(source)

    const pending = this.deps.projectManager.prepare(source)
    const credentialStore = this.deps.projectManager.credentialStoreFor(pending)

    // FIXME: CLAUDE: We can't do this yet. We need to chat about how
    // const config = await runOnboardingCli(mod.def.onboarding, {
    //   credentialStore,
    // });
    const config = null as any
    throw ErrNotImplemented.create({})

    const installation = await this.deps.projectManager.commit(pending, config)

    return installation
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
