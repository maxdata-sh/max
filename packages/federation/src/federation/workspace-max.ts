/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceClient. Holds a Supervisor internally (not exposed on
 * the client surface). Registry persists installation metadata to max.json;
 * Supervisor manages live handles in memory and assigns identity.
 *
 * Routing: config.via → deployer lookup → delegate. The workspace doesn't
 * interpret the spec — it passes it through to the provider.
 *
 * Creation flow:
 *   1. Deduplicate on natural key (connector + name)
 *   2. Route to deployer via config.via
 *   3. Deployer creates a live node → returns UnlabelledHandle
 *   4. Supervisor stamps it with an ID → returns NodeHandle
 *   5. Registry persists the entry
 *   6. Start the installation
 */

import { DeployerKind, InstallationId, Locator, Schema } from '@max/core'
import { HealthStatus, ISODateString, StartResult, StopResult } from '@max/core'
import type { ConnectorRegistry, ConnectorRegistryEntry, OnboardingFlowAny } from '@max/connector'
import type {
  ConnectInstallationConfig,
  CreateInstallationConfig,
  InstallationClient,
  WorkspaceClient,
} from '../protocols'
import type { InstallationInfo } from './installation-registry.js'
import { InstallationRegistry } from './installation-registry.js'
import { InstallationSupervisor } from './supervisors.js'
import { InstallationDeployer } from '../deployers/index.js'
import {
  ErrInstallationAlreadyExists,
  ErrInstallationHandleNotFound,
  ErrInstallationNotFound,
} from '../errors/errors.js'
import {DeployerRegistry, DeploymentConfig} from "../deployers/index.js";

export type WorkspaceMaxConstructable = {
  installationSupervisor: InstallationSupervisor
  installationRegistry: InstallationRegistry
  connectorRegistry: ConnectorRegistry
  installationDeployer: DeployerRegistry<InstallationDeployer>
}

export class WorkspaceMax implements WorkspaceClient {
  private readonly supervisor: InstallationSupervisor
  private readonly installationRegistry: InstallationRegistry
  private readonly connectorRegistry: ConnectorRegistry
  private readonly installationDeployer: DeployerRegistry<InstallationDeployer>

  constructor(args: WorkspaceMaxConstructable) {
    this.supervisor = args.installationSupervisor
    this.installationRegistry = args.installationRegistry
    this.connectorRegistry = args.connectorRegistry
    this.installationDeployer = args.installationDeployer
  }

  // --------------------------------------------------------------------------
  // Connector discovery
  // --------------------------------------------------------------------------

  async listConnectors(): Promise<ConnectorRegistryEntry[]> {
    return this.connectorRegistry.list()
  }

  async connectorSchema(connector: string): Promise<Schema> {
    const mod = await this.connectorRegistry.resolve(connector)
    return mod.def.schema
  }

  async connectorOnboarding(connector: string): Promise<OnboardingFlowAny> {
    const mod = await this.connectorRegistry.resolve(connector)
    return mod.def.onboarding
  }

  async listInstallations(): Promise<InstallationInfo[]> {
    const items = this.installationRegistry.list()
    return items.map(
      (item): InstallationInfo => ({
        connector: item.connector,
        name: item.name,
        id: item.id,
        connectedAt: item.connectedAt,
        locator: item.locator
      })
    )
  }

  // FIXME: These are strange ergonomics. We need to smooth how "connect" "create" and "installation()" are used
  installation(id: InstallationId): InstallationClient {
    const handle = this.supervisor.get(id)
    if (!handle){
      throw ErrInstallationHandleNotFound.create({installation: id})
    }
    return handle.client
  }

  async createInstallation<K extends DeployerKind>(config: CreateInstallationConfig<K>): Promise<InstallationId> {
    const { spec } = config
    const name = spec.name ?? spec.connector

    // Deduplicate on natural key (connector + name)
    const existing = this.installationRegistry
      .list()
      .find((e) => e.connector === spec.connector && e.name === name)
    if (existing) {
      throw ErrInstallationAlreadyExists.create({ connector: spec.connector, name })
    }

    // Runtime lookup by the string value of config.via
    const deployer = this.installationDeployer.get(config.via)
    const unlabelled = await deployer.create(config.config as DeploymentConfig, spec)

    // Supervisor assigns identity, returns NodeHandle
    const handle = this.supervisor.register(unlabelled)

    // Persist to registry
    this.installationRegistry.add({
      id: handle.id,
      connector: spec.connector,
      name,
      connectedAt: ISODateString.now(),
      locator: Locator.toURI(unlabelled.locator),
      deployment: config.config,
      spec: config.spec
    })

    // Start!
    await handle.client.start()

    return handle.id
  }

  // FIXME: Let's return an InstallationClient instead
  async connectInstallation(installationId: InstallationId): Promise<InstallationId> {

    const meta = this.installationRegistry.get(installationId)
    if (!meta){
      throw ErrInstallationNotFound.create({installation: installationId})
    }

    // Connect to the remote node
    const deployer = this.installationDeployer.get(meta.deployment.strategy)

    const unlabelled = await deployer.connect(meta.deployment, meta.spec)

    // Ask the node to describe itself — connector, name, schema
    const description = await unlabelled.client.describe()

    // Supervisor assigns identity
    const handle = this.supervisor.register(unlabelled)

    // Persist with real metadata from the node itself
    this.installationRegistry.add({
      id: installationId,
      connector: description.connector,
      name: description.name,
      connectedAt: ISODateString.now(),
      deployment: meta.deployment,
      spec: meta.spec,
      locator: Locator.toURI(unlabelled.locator)
    })

    return handle.id
  }

  async removeInstallation(id: InstallationId): Promise<void> {
    this.supervisor.unregister(id)
    this.installationRegistry.remove(id)
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
      if (result.outcome === 'error' || result.outcome === 'refused') {
        const reason = result.outcome === 'error' ? result.error : result.reason
        console.warn(
          `Failed to start installation handle=${handle.id} for deployer=${handle.deployerKind}`,
          reason
        )
      } else {
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
