import { ISODateString, WorkspaceId } from '@max/core'
import {BasicRegistry, InMemoryBasicRegistry} from "./basic-registry.js";
import {DeploymentConfig} from "../deployers/index.js";

export interface WorkspaceRegistryEntry {
  readonly id: WorkspaceId
  readonly name: string
  readonly connectedAt: ISODateString
  readonly config: DeploymentConfig
}

export interface WorkspaceRegistry extends BasicRegistry<WorkspaceRegistryEntry, WorkspaceId> {
  /** Hydrate entries from the backing store. */
  load(): Promise<void>
  /** Flush entries to the backing store. */
  persist(): Promise<void>
}


export class InMemoryWorkspaceRegistry
  extends InMemoryBasicRegistry<WorkspaceRegistryEntry, WorkspaceId>
  implements WorkspaceRegistry
{
  constructor() {
    super('workspace', (value) => value.id)
  }

  async load(): Promise<void> {}
  async persist(): Promise<void> {}
}
