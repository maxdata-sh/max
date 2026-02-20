import { ErrRegistryEntryNotFound } from './errors.js'

export interface BasicRegistry<TEntry, TKey extends string> {
  add(entry: TEntry): void
  remove(id: TKey): void
  get(id: TKey): TEntry | undefined
  list(): TEntry[]
}

export class InMemoryBasicRegistry<TEntry, TKey extends string> implements BasicRegistry<
  TEntry,
  TKey
> {
  private map = new Map<TKey, TEntry>()
  constructor(private registryName: string, private keyGetter: (e: TEntry) => TKey) {}
  add = (entry: TEntry) => this.map.set(this.keyGetter(entry), entry)
  get = (id: TKey) => this.map.get(id)
  list = () => [...this.map.values()]
  remove = (id: TKey) => {
    if (!this.map.delete(id)) {
      throw ErrRegistryEntryNotFound.create({ registry: this.registryName, id })
    }
  }
}
