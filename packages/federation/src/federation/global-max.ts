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

import { HealthStatus, StartResult, StopResult, ISODateString, type WorkspaceId } from '@max/core'
import type { WorkspaceClient } from '../protocols/workspace-client.js'
import type {
  CreateWorkspaceConfig,
  GlobalClient,
  WorkspaceInfo,
} from '../protocols/global-client.js'
import { WorkspaceSupervisor } from './supervisors.js'
import { WorkspaceNodeProvider } from '../providers/index.js'
import { WorkspaceRegistry } from "./workspace-registry.js"

export type GlobaleMaxConstructable = {
  workspaceSupervisor: WorkspaceSupervisor
  workspaceProvider: WorkspaceNodeProvider
  registry: WorkspaceRegistry
}

export class GlobalMax implements GlobalClient {
  private readonly workspaceSupervisor: WorkspaceSupervisor
  private readonly workspaceProvider: WorkspaceNodeProvider
  private readonly registry: WorkspaceRegistry

  constructor(args: GlobaleMaxConstructable) {
    this.workspaceSupervisor = args.workspaceSupervisor
    this.workspaceProvider = args.workspaceProvider
    this.registry = args.registry
  }

  workspace(id: WorkspaceId): WorkspaceClient | undefined {
    return this.workspaceSupervisor.get(id)?.client
  }

  async createWorkspace(config: CreateWorkspaceConfig): Promise<WorkspaceId> {
    // 1. Provider creates a live workspace (stateless, returns UnlabelledHandle)
    const unlabelled = await this.workspaceProvider.create(config)

    // 2. Supervisor assigns identity, returns NodeHandle
    const handle = this.workspaceSupervisor.register(unlabelled)

    // 3. Persist to registry
    this.registry.add({
      id: handle.id,
      // FIXME: We haven't established naming semantics for workspaces. Is a name a requirement?
      name: config.name ?? "unnamed",
      providerKind: handle.providerKind,
      connectedAt: ISODateString.now(),
      // FIXME: We need to establish what a location actually is. We should be able to determine a URI at this point
      location: null
    })

    // 4. Start
    await handle.client.start()

    return handle.id
  }

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    const items = this.registry.list()
    return items.map(
      (item): WorkspaceInfo => ({
        id: item.id,
        name: item.name,
        connectedAt: item.connectedAt,
        location: item.location,
        providerKind: item.providerKind
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
