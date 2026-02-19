/**
 * InProcess providers — Zero-overhead, same-process child hosting.
 *
 * The InProcess strategy instantiates children directly in the current
 * runtime. No process boundary, no serialization, no transport overhead.
 * The handle's client field IS the real object — no proxy, no indirection.
 *
 * Providers are stateless factories. They create unlabelled handles and
 * forget about them. The Supervisor assigns identity and tracks handles.
 */

import {
  type ProviderKind,
  type ScopedResource,
  type WorkspaceScope,
  type UnlabelledHandle,
} from '@max/core'
import type { InstallationClient } from '../protocols/index.js'
import type { WorkspaceClient } from '../protocols/workspace-client.js'
import { WorkspaceMax, WorkspaceMaxConstructable } from '../federation/workspace-max.js'
import { InstallationNodeProvider } from './installation-node-provider.js'
import { WorkspaceNodeProvider } from './workspace-node-provider.js'
import { CreateInstallationConfig } from '../protocols/index.js'
import { ErrConnectNotSupported } from '../errors/errors.js'

const IN_PROCESS_PROVIDER_KIND: ProviderKind = 'in-process'

// ============================================================================
// InProcessInstallationProvider
// ============================================================================

type InstallationInput = ScopedResource<CreateInstallationConfig, WorkspaceScope>
type InstantiateInstallation = (input: InstallationInput) => Promise<InstallationClient>

export class InProcessInstallationProvider implements InstallationNodeProvider<InstallationInput> {
  readonly kind = IN_PROCESS_PROVIDER_KIND

  constructor(private readonly factory: InstantiateInstallation) {}

  async create(input: InstallationInput): Promise<UnlabelledHandle<InstallationClient>> {
    const client = await this.factory(input)
    return { providerKind: IN_PROCESS_PROVIDER_KIND, client }
  }

  async connect(_location: unknown): Promise<UnlabelledHandle<InstallationClient>> {
    throw ErrConnectNotSupported.create({ providerKind: 'in-process' })
  }
}

// ============================================================================
// InProcessWorkspaceProvider
// ============================================================================

export interface InProcessWorkspaceConfig {
  workspace: WorkspaceMaxConstructable
}

export class InProcessWorkspaceProvider implements WorkspaceNodeProvider<InProcessWorkspaceConfig> {
  readonly kind = IN_PROCESS_PROVIDER_KIND

  async create(config: InProcessWorkspaceConfig): Promise<UnlabelledHandle<WorkspaceClient>> {
    const workspace = new WorkspaceMax(config.workspace)
    return { providerKind: IN_PROCESS_PROVIDER_KIND, client: workspace }
  }

  async connect(_location: unknown): Promise<UnlabelledHandle<WorkspaceClient>> {
    throw ErrConnectNotSupported.create({ providerKind: 'in-process' })
  }
}
