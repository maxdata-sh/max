
import {ConnectorModuleAny, ConnectorRegistry, ConnectorRegistryEntry, InMemoryConnectorRegistry} from "@max/connector";
import {ConnectorVersionIdentifier} from "@max/core";
import { ErrConnectorNotFound, ErrConnectorNotInstalled } from '@max/federation'


export class BunConnectorRegistry implements ConnectorRegistry {

  #registry = new InMemoryConnectorRegistry()

  constructor(modules: Record<string,string>) {
    Object.entries(modules).forEach(([k,v]) => {
      this.addLocalNamed(k,async () => {
        try{
          return await import(v)
        }catch (e){
          throw ErrConnectorNotInstalled.create({connector: k, location: v})
        }

      })
    })
  }

  addLocal(loader: () => Promise<{ default: ConnectorModuleAny }>): void {
    this.#registry.addLocal(loader)
  }

  addLocalNamed(name: string, loader: () => Promise<{ default: ConnectorModuleAny }>): void {
    this.#registry.addLocalNamed(name, loader)
  }

  list(): ConnectorRegistryEntry[] {
    return this.#registry.list()
  }

  resolve(name: string): Promise<ConnectorModuleAny> {
    return this.#registry.resolve(name)
  }

  /**
   * FIXME:
   * Stopgap solution whilst we build out connector registry - just pull the
   *  identifiers from a list of installations.
   */
  static fromConnectorList(connectors: ConnectorVersionIdentifier[]): BunConnectorRegistry {
    const mapping = Object.fromEntries(connectors.map(c => {
      const [loc,ver] = c.split(':')
      return [loc,loc]
    }))
    return new this(mapping)
  }


}
