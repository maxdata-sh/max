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

import { type DeployerKind, HealthStatus, ISODateString, StartResult, StopResult, type WorkspaceId } from '@max/core'
import type { WorkspaceClient } from '../protocols/index.js'
import type { GlobalClient, WorkspaceInfo } from '../protocols/global-client.js'
import { CreateWorkspaceArgs } from '../protocols/global-client.js'
import { WorkspaceSupervisor } from './supervisors.js'

import { WorkspaceRegistry } from './workspace-registry.js'

import { ErrWorkspaceHandleNotFound } from '../errors/errors.js'
import { DeployerRegistry, DeploymentConfig, WorkspaceDeployer } from '../deployers/index.js'

export type GlobalMaxConstructable = {
  workspaceSupervisor: WorkspaceSupervisor
  workspaceRegistry: WorkspaceRegistry
  workspaceDeployer: DeployerRegistry<WorkspaceDeployer>
}

export class GlobalMax implements GlobalClient {
  private readonly workspaceSupervisor: WorkspaceSupervisor
  private readonly workspaceRegistry: WorkspaceRegistry
  private readonly workspaceDeployer: DeployerRegistry<WorkspaceDeployer>

  constructor(args: GlobalMaxConstructable) {
    this.workspaceSupervisor = args.workspaceSupervisor
    this.workspaceDeployer = args.workspaceDeployer
    this.workspaceRegistry = args.workspaceRegistry
  }

  workspace(id: WorkspaceId): WorkspaceClient {
    const ws = this.workspaceSupervisor.get(id)
    if (!ws) {
      throw ErrWorkspaceHandleNotFound.create({ workspace: id })
    }
    return ws.client
  }

  async createWorkspace<K extends DeployerKind>(
    name: string,
    args: CreateWorkspaceArgs<K>
  ): Promise<WorkspaceId> {

    // Runtime lookup by the string value of args.via
    const deployer = this.workspaceDeployer.get(args.via)
    const unlabelled = await deployer.create(args.config as DeploymentConfig, args.spec ?? { name })

    // Supervisor assigns identity, returns NodeHandle
    const handle = this.workspaceSupervisor.register(unlabelled)

    // Persist to registry
    this.workspaceRegistry.add({
      id: handle.id,
      name: name,
      connectedAt: ISODateString.now(),
      config: { ...args.config, strategy: args.via } as DeploymentConfig,
    })

    console.log("Persisted workspace at", args.config)

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
      })
    )
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
    // Load persisted workspace entries before hydrating
    await this.workspaceRegistry.load()

    const handles = this.workspaceSupervisor.list()
    for (const handle of handles) {
      await handle.client.start()
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
