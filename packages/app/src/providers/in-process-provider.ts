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
  ChildHandle,
  ChildProvider,
  Supervisor,
} from "@max/core"
import type { ConnectorRegistry } from "@max/connector"
import type { InstallationProtocol } from "../protocols/installation-protocol.js"
import type { WorkspaceProtocol } from "../protocols/workspace-protocol.js"
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
  implements ChildProvider<InstallationProtocol, InstallationId>
{
  readonly kind: ProviderKind = PROVIDER_KIND
  private readonly handles = new Map<InstallationId, ChildHandle<InstallationProtocol, InstallationId>>()

  constructor(private readonly deps: InProcessInstallationDeps) {}

  async create(config: unknown): Promise<ChildHandle<InstallationProtocol, InstallationId>> {
    const { connector, name } = config as { connector: string; name?: string }

    const runtime = await InstallationRuntimeImpl.create({
      projectManager: this.deps.projectManager,
      connectorRegistry: this.deps.connectorRegistry,
      connector,
      name,
    })

    const handle: ChildHandle<InstallationProtocol, InstallationId> = {
      id: runtime.info.id,
      providerKind: PROVIDER_KIND,
      protocol: runtime,
    }

    this.handles.set(handle.id, handle)
    return handle
  }

  async connect(): Promise<ChildHandle<InstallationProtocol, InstallationId>> {
    throw new Error("InProcess provider does not support connect — use create()")
  }

  async list(): Promise<ChildHandle<InstallationProtocol, InstallationId>[]> {
    return [...this.handles.values()]
  }
}

// ============================================================================
// InProcessWorkspaceProvider
// ============================================================================

export interface InProcessWorkspaceConfig {
  id: WorkspaceId
  installations: Supervisor<InstallationProtocol, InstallationId>
}

export class InProcessWorkspaceProvider
  implements ChildProvider<WorkspaceProtocol, WorkspaceId>
{
  readonly kind: ProviderKind = PROVIDER_KIND
  private readonly handles = new Map<WorkspaceId, ChildHandle<WorkspaceProtocol, WorkspaceId>>()

  async create(config: unknown): Promise<ChildHandle<WorkspaceProtocol, WorkspaceId>> {
    const { id, installations } = config as InProcessWorkspaceConfig

    const workspace = new WorkspaceMax(installations)
    const handle: ChildHandle<WorkspaceProtocol, WorkspaceId> = {
      id,
      providerKind: PROVIDER_KIND,
      protocol: workspace,
    }

    this.handles.set(id, handle)
    return handle
  }

  async connect(): Promise<ChildHandle<WorkspaceProtocol, WorkspaceId>> {
    throw new Error("InProcess provider does not support connect — use create()")
  }

  async list(): Promise<ChildHandle<WorkspaceProtocol, WorkspaceId>[]> {
    return [...this.handles.values()]
  }
}
