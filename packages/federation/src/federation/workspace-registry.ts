import { ISODateString, WorkspaceId } from '@max/core'
import type { SerialisedWorkspaceHosting } from '../config/hosting-config.js'
import {BasicRegistry, InMemoryBasicRegistry} from "./basic-registry.js";

export interface WorkspaceRegistryEntry {
  readonly id: WorkspaceId
  readonly name: string
  readonly connectedAt: ISODateString
  readonly hosting: SerialisedWorkspaceHosting
}

export interface WorkspaceRegistry extends BasicRegistry<WorkspaceRegistryEntry, WorkspaceId> {}


export class InMemoryWorkspaceRegistry
  extends InMemoryBasicRegistry<WorkspaceRegistryEntry, WorkspaceId>
  implements WorkspaceRegistry
{
  constructor() {
    super('workspace', (value) => value.id)
  }
}
