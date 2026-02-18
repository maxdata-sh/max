import { ConnectorType, InstallationId, ISODateString, ProviderKind, WorkspaceId } from '@max/core'
import { ErrRegistryEntryNotFound } from './errors.js'
import {BasicRegistry, InMemoryBasicRegistry} from "./basic-registry.js";

export interface WorkspaceRegistryEntry {
  readonly id: WorkspaceId
  readonly name: string
  readonly connectedAt: ISODateString
  readonly providerKind: ProviderKind
  readonly location: unknown // provider-specific, stored opaquely
}

export interface WorkspaceRegistry extends BasicRegistry<WorkspaceRegistryEntry, WorkspaceId> {}


export class InMemoryWorkspaceRegistry
  extends InMemoryBasicRegistry<WorkspaceRegistryEntry, WorkspaceId>
  implements WorkspaceRegistry
{
  constructor() {
    super((value) => value.id)
  }
}
