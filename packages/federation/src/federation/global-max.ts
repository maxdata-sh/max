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

import { MaxUrl, type DeployerKind, HealthStatus, ISODateString, StartResult, StopResult, type WorkspaceId } from '@max/core'
import type { WorkspaceClient } from '../protocols/index.js'
import type { GlobalClient, WorkspaceInfo, WorkspaceListEntry } from '../protocols/global-client.js'
import { CreateWorkspaceArgs } from '../protocols/global-client.js'
import { WorkspaceSupervisor } from './supervisors.js'

import { WorkspaceRegistry } from './workspace-registry.js'

import { ErrWorkspaceHandleNotFound, ErrRemoteUrlNotSupported, ErrWorkspaceNotResolved, ErrInstallationNotResolved } from '../errors/errors.js'
import { DeployerRegistry, DeploymentConfig, WorkspaceDeployer } from '../deployers/index.js'
import { type MaxUrlResolver, type ResolvedTarget, hasInstallationNameLookup } from './max-url-resolver.js'

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

  workspaceByNameOrId(nameOrId: string): { id: WorkspaceId; client: WorkspaceClient } | undefined {
    // Try name first: scan registry
    const byName = this.workspaceRegistry.list().find(e => e.name === nameOrId)
    if (byName) {
      const handle = this.workspaceSupervisor.get(byName.id)
      if (handle) return { id: byName.id, client: handle.client }
    }

    // Fall back to ID
    const handle = this.workspaceSupervisor.get(nameOrId as WorkspaceId)
    if (handle) return { id: nameOrId as WorkspaceId, client: handle.client }

    return undefined
  }

  maxUrlResolver(): MaxUrlResolver {
    return {
      resolve: (url: MaxUrl): ResolvedTarget => {
        if (!url.isLocal) {
          throw ErrRemoteUrlNotSupported.create({ url: url.toString() })
        }

        // Level 0: Global
        if (url.level === 'global') {
          return { level: 'global', client: this }
        }

        // Level 1: Workspace
        const ws = this.workspaceByNameOrId(url.workspace!)
        if (!ws) {
          throw ErrWorkspaceNotResolved.create({ segment: url.workspace!, url: url.toString() })
        }

        if (url.level === 'workspace') {
          return { level: 'workspace', client: ws.client, id: ws.id }
        }

        // Level 2: Installation (delegate to workspace's name lookup)
        if (!hasInstallationNameLookup(ws.client)) {
          throw ErrRemoteUrlNotSupported.create({ url: url.toString() })
        }

        const inst = ws.client.installationByNameOrId(url.installation!)
        if (!inst) {
          throw ErrInstallationNotResolved.create({
            segment: url.installation!,
            workspace: url.workspace!,
            url: url.toString(),
          })
        }

        return { level: 'installation', client: inst.client, id: inst.id, workspaceId: ws.id }
      },
    }
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
