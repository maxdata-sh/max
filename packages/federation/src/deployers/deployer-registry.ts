import {InMemoryBasicRegistry} from '../federation/basic-registry.js'
import {ErrDeployerNotAvailable} from '../errors/errors.js'
import {Deployer, DeployerKind} from '@max/core'
import {PlatformName} from "../platform";


/** This holds onto an in-memory set of deployers that can be used at node-provider construction time */
export class DeployerRegistry<TDeployers extends Deployer = Deployer> extends InMemoryBasicRegistry<
  Deployer,
  DeployerKind
> {
  constructor(
    private currentPlatform: PlatformName,
    deployers: TDeployers[]
  ) {
    super(`${currentPlatform}.deployers`, (p) => p.deployerKind)
    for (const deployer of deployers) {
      this.add(deployer)
    }
  }

  override get<K extends TDeployers['deployerKind']>(
    strategy: K
  ): Extract<TDeployers, { deployerKind: K }>;
  override get(strategy: DeployerKind): TDeployers;
  override get(strategy: DeployerKind): TDeployers {
    const registry = super.get(strategy)
    if (!registry) {
      throw ErrDeployerNotAvailable.create({
        platform: this.currentPlatform,
        deployerKind: strategy,
      })
    }
    return registry as TDeployers
  }
}
