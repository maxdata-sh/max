/**
 * GlobalMax — Entry point. Manages workspaces.
 *
 * Implements GlobalProtocol. The top of the federation hierarchy.
 *
 * Creation flow:
 *   1. Provider creates a live workspace → returns UnlabelledHandle
 *   2. Supervisor assigns identity → returns NodeHandle
 *   3. Registry persists the entry
 *   4. Start the workspace
 */

import {
  type DeployerKind,
  HealthStatus,
  ISODateString,
  StartResult,
  StopResult,
  type WorkspaceId,
} from '@max/core'
import type { WorkspaceClient, InstallationClient } from '../protocols/index.js'
import type { WorkspaceInfo, WorkspaceListEntry } from '../protocols/global-client.js'
import { CreateWorkspaceArgs } from '../protocols/global-client.js'
import { WorkspaceSupervisor } from './supervisors.js'

import { WorkspaceRegistry } from './workspace-registry.js'

import { ErrWorkspaceHandleNotFound } from '../errors/errors.js'
import { DeployerRegistry, DeploymentConfig, WorkspaceDeployer } from '../deployers/index.js'
import { DefaultMaxUrlResolver } from './default-max-url-resolver.js'
import {
  GlobalClientWithIdentity,
  WorkspaceClientWithIdentity,
} from '../protocols/with-client-identity.js'
import { stampClientWithIdentity } from './stamp-client-with-identity.js'
import { createEphemeralMax, type EphemeralOverrides } from './ephemeral.js'

export type GlobalMaxConstructable = {
  workspaceSupervisor: WorkspaceSupervisor
  workspaceRegistry: WorkspaceRegistry
  workspaceDeployer: DeployerRegistry<WorkspaceDeployer>
}


export class GlobalMax implements GlobalClientWithIdentity {
  static ephemeral(overrides?: EphemeralOverrides): GlobalMax {
    return createEphemeralMax(overrides)
  }

  id = "@" as const

  private readonly workspaceSupervisor: WorkspaceSupervisor
  private readonly workspaceRegistry: WorkspaceRegistry
  private readonly workspaceDeployer: DeployerRegistry<WorkspaceDeployer>

  constructor(args: GlobalMaxConstructable) {
    this.workspaceSupervisor = args.workspaceSupervisor
    this.workspaceDeployer = args.workspaceDeployer
    this.workspaceRegistry = args.workspaceRegistry
  }

  workspace(id: WorkspaceId): WorkspaceClientWithIdentity {
    const ws = this.workspaceSupervisor.get(id)
    if (!ws) {
      throw ErrWorkspaceHandleNotFound.create({ workspace: id })
    }
    return stampClientWithIdentity<'workspace', WorkspaceClient>(ws.client,ws.id)
  }

  workspaceByNameOrId(nameOrId: string): WorkspaceClientWithIdentity | undefined {
    // Try name first: scan registry
    const byName = this.workspaceRegistry.list().find(e => e.name === nameOrId)
    if (byName) {
      const handle = this.workspaceSupervisor.get(byName.id)
      if (handle) return stampClientWithIdentity<'workspace', WorkspaceClient>(handle.client, handle.id)
    }

    // Fall back to ID
    const handle = this.workspaceSupervisor.get(nameOrId as WorkspaceId)
    if (handle) return stampClientWithIdentity<'workspace', WorkspaceClient>(handle.client, handle.id)

    return undefined
  }

  maxUrlResolver = new DefaultMaxUrlResolver({
    global: () => this,
    workspace: (nameOrId) => this.workspaceByNameOrId(nameOrId),
    installation: async (nameOrId, workspace) => {
      const list = await workspace.listInstallations()
      const match = list.find(e => e.name === nameOrId || e.id === nameOrId)
      if (!match) return undefined
      return stampClientWithIdentity<'installation', InstallationClient>(
        workspace.installation(match.id), match.id
      )
    },
  })

  async createWorkspace<K extends DeployerKind>(
    name: string,
    args: CreateWorkspaceArgs<K>
  ): Promise<WorkspaceId> {

    // Runtime lookup by the string value of args.via
    const deployer = this.workspaceDeployer.get(args.via)
    const unlabelled = await deployer.create(args.config as DeploymentConfig, args.spec ?? { name })

    // Supervisor assigns identity, returns NodeHandle
    const handle = this.workspaceSupervisor.register(unlabelled)

    const spec = args.spec ?? { name }

    // Persist to registry
    this.workspaceRegistry.add({
      id: handle.id,
      name: name,
      connectedAt: ISODateString.now(),
      config: { ...args.config, strategy: args.via } as DeploymentConfig,
      spec,
    })

    // Persist the registry
    await this.workspaceRegistry.persist()

    // Start 'er up
    await handle.client.start()

    return handle.id
  }

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    const items = this.workspaceRegistry.list()
    return items.map(
      (item): WorkspaceInfo => ({
        id: item.id,
        name: item.name,
        connectedAt: item.connectedAt,
        config: item.config,
        spec: item.spec,
      })
    )
  }

  async listWorkspacesFull(): Promise<WorkspaceListEntry[]> {
    const items = await this.listWorkspaces()
    const aggregate = await this.workspaceSupervisor.health()
    return items.map((item): WorkspaceListEntry => ({
      ...item,
      health: aggregate.children.get(item.id) ?? HealthStatus.unhealthy('not running'),
    }))
  }

  removeWorkspace(id: WorkspaceId): Promise<void> {
    return Promise.resolve(undefined)
  }

  async health() {
    const aggregate = await this.workspaceSupervisor.health()
    return HealthStatus[aggregate.status](
      aggregate.status !== 'healthy' ? `${aggregate.children.size} workspace(s) checked` : undefined
    )
  }

  async start(): Promise<StartResult> {
    // Load persisted workspace entries
    await this.workspaceRegistry.load()

    // Reconcile: deploy each persisted workspace into the supervisor
    const entries = this.workspaceRegistry.list()
    for (const entry of entries) {
      try {
        const deployer = this.workspaceDeployer.get(entry.config.strategy)
        const unlabelled = await deployer.connect(entry.config, entry.spec)
        const handle = this.workspaceSupervisor.register(unlabelled, entry.id)
        await handle.client.start()
      } catch (err) {
        console.warn(`Failed to reconcile workspace ${entry.name} (${entry.id}):`, err)
      }
    }

    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    const handles = this.workspaceSupervisor.list()
    for (let i = handles.length - 1; i >= 0; i--) {
      await handles[i].client.stop()
    }
    return StopResult.stopped()
  }
}
