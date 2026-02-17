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
  NodeProvider,
  Supervisor,
} from "@max/core"
import type { ConnectorRegistry } from "@max/connector"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { WorkspaceClient } from "../protocols/workspace-client.js"
import type { InstallationHandle, WorkspaceHandle } from "../federation/handle-types.js"
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
  private readonly handles = new Map<InstallationId, InstallationHandle>()

  constructor(private readonly deps: InProcessInstallationDeps) {}

  async create(config: unknown): Promise<InstallationHandle> {
    const { connector, name } = config as { connector: string; name?: string }

    const runtime = await InstallationRuntimeImpl.create({
      projectManager: this.deps.projectManager,
      connectorRegistry: this.deps.connectorRegistry,
      connector,
      name,
    })

    const handle: InstallationHandle = {
      id: runtime.info.id,
      providerKind: PROVIDER_KIND,
      client: runtime,
    }

    this.handles.set(handle.id, handle)
    return handle
  }

  async connect(): Promise<InstallationHandle> {
    throw new Error("InProcess provider does not support connect — use create()")
  }

  async list(): Promise<InstallationHandle[]> {
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
  private readonly handles = new Map<WorkspaceId, WorkspaceHandle>()

  async create(config: unknown): Promise<WorkspaceHandle> {
    const { id, installations } = config as InProcessWorkspaceConfig

    const workspace = new WorkspaceMax(installations)
    const handle: WorkspaceHandle = {
      id,
      providerKind: PROVIDER_KIND,
      client: workspace,
    }

    this.handles.set(id, handle)
    return handle
  }

  async connect(): Promise<WorkspaceHandle> {
    throw new Error("InProcess provider does not support connect — use create()")
  }

  async list(): Promise<WorkspaceHandle[]> {
    return [...this.handles.values()]
  }
}
