import { ConnectorType, InstallationId, ISODateString, ProviderKind } from '@max/core'

export interface InstallationRegistryEntry {
  readonly id: InstallationId
  readonly connector: ConnectorType
  readonly name: string
  readonly connectedAt: ISODateString
  readonly providerKind: ProviderKind
  readonly location: unknown // provider-specific, stored opaquely
}

export interface InstallationRegistry {
  add(entry: InstallationRegistryEntry): void
  remove(id: InstallationId): void
  get(id: InstallationId): InstallationRegistryEntry | undefined
  list(): InstallationRegistryEntry[]
}


export class InMemoryInstallationRegistry implements InstallationRegistry {
  private map = new Map<InstallationId, InstallationRegistryEntry>()
  add = (entry:InstallationRegistryEntry) => this.map.set(entry.id, entry)
  get = (id: InstallationId) => this.map.get(id)
  list = () => [...this.map.values()]
  remove = (id: InstallationId) => this.map.delete(id)
}
