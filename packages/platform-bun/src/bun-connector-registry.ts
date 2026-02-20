
import {ConnectorModuleAny, ConnectorRegistry, ConnectorRegistryEntry, InMemoryConnectorRegistry} from "@max/connector";

/** This registry is not as smart as it should be. It just looks at the FS once, and loads those connectors into an in-mem store */
export class BunConnectorRegistry implements ConnectorRegistry {

  #registry = new InMemoryConnectorRegistry()


  // FIXME: I think this FS registry needs to at least have a config value that tells it where it should look for, at max, prefixed packages so that the import statement can try to load directly from that location.
  // I think there is definitely a cleaner approach to that that involves making resolution a bit more of a first-class citizen, so let's talk about that.
  constructor(modules: Record<string,string>) {
    Object.entries(modules).forEach(([k,v]) => {
      this.addLocalNamed(k,async () => import(v))
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


}
