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

import {
  Engine,
  ErrNotSupported,
  InstallationId,
  ProviderKind,
  Supervisor,
  WorkspaceId,
} from '@max/core'
import type { ConnectorRegistry } from '@max/connector'
import type { InstallationClient } from '../protocols/installation-client.js'
import type { InstallationHandle, WorkspaceHandle } from '../federation/handle-types.js'
import type { ProjectManager } from '../project-manager/index.js'
import { InstallationRuntimeImpl } from '../runtime/installation-runtime.js'
import { WorkspaceMax, WorkspaceMaxConstructable } from '../federation/workspace-max.js'
import { WorkspaceNodeProvider } from './workspace-node-provider.js'
import { InstallationNodeProvider } from './installation-node-provider.js'
import {InstallationSupervisor} from "../federation/supervisors.js";
import {ServiceProvider} from "./service-provider.js";

const IN_PROCESS_PROVIDER_KIND: ProviderKind = 'in-process'

// ============================================================================
// InProcessInstallationProvider
// ============================================================================

export interface InProcessInstallationDeps {
  projectManager: ProjectManager
  connectorRegistry: ConnectorRegistry
}

export class InProcessInstallationProvider implements InstallationNodeProvider {
  readonly kind = IN_PROCESS_PROVIDER_KIND
  private readonly handles = new Map<InstallationId, InstallationHandle>()

  constructor(private readonly deps: InProcessInstallationDeps) {}

  async create(config: unknown): Promise<InstallationHandle> {
    const { connector, name } = config as { connector: string; name?: string }

    // CLAUDE: FIXME: This is creating a _runtime_ - not an installation.
    // What we need is to create ourselves a client.
    const runtime = await InstallationRuntimeImpl.deprecated_create_connect({
      projectManager: this.deps.projectManager,
      connectorRegistry: this.deps.connectorRegistry,
      connector,
      name,
    })

    const handle: InstallationHandle = {
      id: runtime.info.id,
      providerKind: IN_PROCESS_PROVIDER_KIND,
      client: runtime,
    }

    this.handles.set(handle.id, handle)
    return handle
  }

  async connect(): Promise<InstallationHandle> {
    throw ErrNotSupported.create({}, 'InProcess provider does not support connect — use create() instead')
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
  workspace: WorkspaceMaxConstructable
}

export class InProcessWorkspaceProvider implements WorkspaceNodeProvider {
  readonly kind = IN_PROCESS_PROVIDER_KIND
  private readonly handles = new Map<WorkspaceId, WorkspaceHandle>()

  async create(config: InProcessWorkspaceConfig): Promise<WorkspaceHandle> {
    const id = config.id

    const workspace = new WorkspaceMax(config.workspace)

    const handle: WorkspaceHandle = {
      id,
      providerKind: IN_PROCESS_PROVIDER_KIND,
      client: workspace,
    }

    this.handles.set(id, handle)
    return handle
  }

  async connect(): Promise<WorkspaceHandle> {
    throw ErrNotSupported.create(
      {},
      'InProcess provider does not support connect — use create() instead'
    )
  }

  async list(): Promise<WorkspaceHandle[]> {
    return [...this.handles.values()]
  }
}
