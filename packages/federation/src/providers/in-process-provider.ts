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
  ScopedResource,
  WorkspaceId,
  WorkspaceScope,
} from '@max/core'
import { ConnectorRegistry } from '@max/connector'
import type { InstallationHandle, WorkspaceHandle } from '../federation/handle-types.js'
import type { ProjectManager } from '../project-manager/index.js'
import { InstallationMaxConstructable } from '../federation/installation-max.js'
import { WorkspaceMax, WorkspaceMaxConstructable } from '../federation/workspace-max.js'
import { WorkspaceNodeProvider } from './workspace-node-provider.js'
import { InstallationNodeProvider } from './installation-node-provider.js'
import { ServiceProvider } from './service-provider.js'
import { ExecutionRegistry, SyncExecutor, TaskRunner } from '@max/execution'
import { CreateInstallationConfig, InstallationClient } from '../protocols/index.js'
import { ErrInstallationHandleNotFound, ErrWorkspaceHandleNotFound } from '../errors/errors.js'

const IN_PROCESS_PROVIDER_KIND: ProviderKind = 'in-process'

// ============================================================================
// InProcessInstallationProvider
// ============================================================================

export interface InProcessInstallationDeps {
  projectManager: ProjectManager
  connectorRegistry: ConnectorRegistry
  providers: {
    engine: ServiceProvider<Engine>
    syncExecutor: ServiceProvider<SyncExecutor>
    executionRegistry: ServiceProvider<ExecutionRegistry>
    taskRunner: ServiceProvider<TaskRunner>
  }
}

type InstallationInput = ScopedResource<CreateInstallationConfig, WorkspaceScope>
type InstantiateInstallation = (input: InstallationInput) => Promise<InstallationClient>


export class InProcessInstallationProvider implements InstallationNodeProvider<InstallationInput> {
  readonly kind = IN_PROCESS_PROVIDER_KIND
  private readonly handles = new Map<InstallationId, InstallationHandle>()

  constructor(private readonly factory: InstantiateInstallation) {}

  async create(input: InstallationInput): Promise<InstallationHandle> {
    const client = await this.factory(input)

    const handle: InstallationHandle = {
      id: input.scope.installationId,
      providerKind: IN_PROCESS_PROVIDER_KIND,
      client,
    }

    this.handles.set(handle.id, handle)
    return handle
  }

  async connect(location: InstallationId): Promise<InstallationHandle> {
    const handle = this.handles.get(location)
    if (!handle) {
      throw ErrInstallationHandleNotFound.create({ installation: location })
    }
    return handle
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

export class InProcessWorkspaceProvider implements WorkspaceNodeProvider<InProcessWorkspaceConfig> {
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

  async connect(location: WorkspaceId): Promise<WorkspaceHandle> {
    const handle = this.handles.get(location)
    if (!handle) {
      throw ErrWorkspaceHandleNotFound.create({ workspace: location })
    }
    return handle
  }

  async list(): Promise<WorkspaceHandle[]> {
    return [...this.handles.values()]
  }
}
