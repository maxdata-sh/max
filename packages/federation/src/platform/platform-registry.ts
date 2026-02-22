import {InMemoryBasicRegistry} from "../federation/basic-registry.js";
import {Platform, PlatformName} from "./platform.js";
import {ErrPlatformNotAvailable} from '../errors/errors.js'

/** This holds onto an in-memory set of platform bindings that can be used at node-provider construction time */
export class PlatformRegistry<TPlatform extends Platform = Platform> extends InMemoryBasicRegistry<Platform, PlatformName> {

  constructor(public readonly currentPlatform: TPlatform, supported: TPlatform[]) {
    super(`platform:${currentPlatform.name}`, (p) => p.name);
    this.add(currentPlatform)
    for (const platform of supported) {
      this.add(platform)
    }
  }

  override get(id: PlatformName): TPlatform {
    const registry = super.get(id)
    if (!registry){
      throw ErrPlatformNotAvailable.create({platform: id})
    }
    return registry as TPlatform
  }
}
