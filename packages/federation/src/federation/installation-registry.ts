import { ConnectorType, InstallationId, ISODateString, ProviderKind } from '@max/core'
import { ErrRegistryEntryNotFound } from './errors.js'
import {BasicRegistry, InMemoryBasicRegistry} from "./basic-registry.js";

export interface InstallationRegistryEntry {
  readonly id: InstallationId
  readonly connector: ConnectorType
  readonly name: string
  readonly connectedAt: ISODateString
  readonly providerKind: ProviderKind
  readonly location: unknown // provider-specific, stored opaquely
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
  readonly location: unknown
}
