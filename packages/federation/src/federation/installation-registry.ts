import { ConnectorType, InstallationId, ISODateString } from '@max/core'
import type { SerialisedInstallationHosting } from '../config/hosting-config.js'
import { ErrRegistryEntryNotFound } from './errors.js'
import {BasicRegistry, InMemoryBasicRegistry} from "./basic-registry.js";

export interface InstallationRegistryEntry {
  readonly id: InstallationId
  readonly connector: ConnectorType
  readonly name: string
  readonly connectedAt: ISODateString
  readonly hosting: SerialisedInstallationHosting
}

export interface InstallationRegistry extends BasicRegistry<InstallationRegistryEntry, InstallationId> {}


export class InMemoryInstallationRegistry
  extends InMemoryBasicRegistry<InstallationRegistryEntry, InstallationId>
  implements InstallationRegistry
{
  constructor() {
    super((value) => value.id)
  }
}

/**
 * Lightweight summary for listing installations.
 */
export interface InstallationInfo {
  readonly connector: ConnectorType
  readonly name: string
  readonly id: InstallationId
  readonly connectedAt: string
  readonly hosting: SerialisedInstallationHosting
}
