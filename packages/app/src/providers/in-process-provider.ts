/**
 * InProcess providers — Zero-overhead, same-process child hosting.
 *
 * The InProcess strategy instantiates children directly in the current
 * runtime. No process boundary, no serialization, no transport overhead.
 * This is the default for local development and the current behavior.
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
  Transport,
  Supervisor,
} from "@max/core"
import type { ConnectorRegistry } from "@max/connector"
import type { InstallationProtocol } from "../protocols/installation-protocol.js"
import type { WorkspaceProtocol } from "../protocols/workspace-protocol.js"
import type { ProjectManager } from "../project-manager/index.js"
import { InstallationRuntimeImpl } from "../runtime/installation-runtime.js"
import { WorkspaceMax } from "../federation/workspace-max.js"

// ============================================================================
// InProcessTransport
// ============================================================================

/**
 * Callback-based transport for in-process children.
 *
 * The "message" is the operation itself — a callback that receives the target
 * instance and returns the result. The transport just applies it.
 *
 *   await transport.send((target: InstallationProtocol) => target.sync())
 *
 * This keeps the abstraction clean: callers can use either handle.supervised
 * (direct) or handle.transport.send (uniform) — both work, both reach the
 * same instance, neither throws.
 */
function inProcessTransport<T>(target: T): Transport {
  return {
    async send(message: unknown): Promise<unknown> {
      return (message as (t: T) => unknown)(target)
    },
  }
}

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
      supervised: runtime,
      transport: inProcessTransport(runtime),
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
      supervised: workspace,
      transport: inProcessTransport(workspace),
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
