/**
 * InProcess providers — Zero-overhead, same-process child hosting.
 *
 * The InProcess strategy instantiates children directly in the current
 * runtime. No process boundary, no serialization, no transport overhead.
 * The handle's protocol field IS the real object — no proxy, no indirection.
 *
 * Current codebase mapping:
 *   - InProcessInstallationProvider ← InstallationRuntimeImpl.create()
 *   - InProcessWorkspaceProvider ← new (WorkspaceMax is new)
 */

import type {
  InstallationId,
  WorkspaceId,
  ProviderKind,
  NodeHandle,
  NodeProvider,
  Supervisor,
} from "@max/core"
import type { ConnectorRegistry } from "@max/connector"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { WorkspaceClient } from "../protocols/workspace-client.js"
import type { ProjectManager } from "../project-manager/index.js"
import { InstallationRuntimeImpl } from "../runtime/installation-runtime.js"
import { WorkspaceMax } from "../federation/workspace-max.js"

const PROVIDER_KIND: ProviderKind = "in-process"

// ============================================================================
// InProcessInstallationProvider
// ============================================================================

export interface InProcessInstallationDeps {
  projectManager: ProjectManager
  connectorRegistry: ConnectorRegistry
}

export class InProcessInstallationProvider
  implements NodeProvider<InstallationClient, InstallationId>
{
  readonly kind: ProviderKind = PROVIDER_KIND
  private readonly handles = new Map<InstallationId, NodeHandle<InstallationClient, InstallationId>>()

  constructor(private readonly deps: InProcessInstallationDeps) {}

  async create(config: unknown): Promise<NodeHandle<InstallationClient, InstallationId>> {
    const { connector, name } = config as { connector: string; name?: string }

    const runtime = await InstallationRuntimeImpl.create({
      projectManager: this.deps.projectManager,
      connectorRegistry: this.deps.connectorRegistry,
      connector,
      name,
    })

    const handle: NodeHandle<InstallationClient, InstallationId> = {
      id: runtime.info.id,
      providerKind: PROVIDER_KIND,
      client: runtime,
    }

    this.handles.set(handle.id, handle)
    return handle
  }

  async connect(): Promise<NodeHandle<InstallationClient, InstallationId>> {
    throw new Error("InProcess provider does not support connect — use create()")
  }

  async list(): Promise<NodeHandle<InstallationClient, InstallationId>[]> {
    return [...this.handles.values()]
  }
}

// ============================================================================
// InProcessWorkspaceProvider
// ============================================================================

export interface InProcessWorkspaceConfig {
  id: WorkspaceId
  installations: Supervisor<InstallationClient, InstallationId>
}

export class InProcessWorkspaceProvider
  implements NodeProvider<WorkspaceClient, WorkspaceId>
{
  readonly kind: ProviderKind = PROVIDER_KIND
  private readonly handles = new Map<WorkspaceId, NodeHandle<WorkspaceClient, WorkspaceId>>()

  async create(config: unknown): Promise<NodeHandle<WorkspaceClient, WorkspaceId>> {
    const { id, installations } = config as InProcessWorkspaceConfig

    const workspace = new WorkspaceMax(installations)
    const handle: NodeHandle<WorkspaceClient, WorkspaceId> = {
      id,
      providerKind: PROVIDER_KIND,
      client: workspace,
    }

    this.handles.set(id, handle)
    return handle
  }

  async connect(): Promise<NodeHandle<WorkspaceClient, WorkspaceId>> {
    throw new Error("InProcess provider does not support connect — use create()")
  }

  async list(): Promise<NodeHandle<WorkspaceClient, WorkspaceId>[]> {
    return [...this.handles.values()]
  }
}
