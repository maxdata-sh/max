import { Deployer, DeployerKind, Locator, Supervised, UnlabelledHandle } from '@max/core'
import {
  DeployableSpec,
  ErrCreateNotSupported,
  Platform,
} from '@max/federation'
import {InProcessDeploymentConfig} from "../types.js";

export interface InProcessLocator extends Locator {
  strategy: 'in-process'
}

export class InProcessDeployer<
  C extends Supervised,
  TSpec extends DeployableSpec,
> implements Deployer<C, InProcessDeploymentConfig, InProcessLocator, TSpec> {
  static readonly deployerKind = DeployerKind.create<InProcessDeploymentConfig>('in-process')
  deployerKind = InProcessDeployer.deployerKind


  constructor(private bootstrap: (config: InProcessDeploymentConfig, spec: TSpec) => Promise<C>) {}

  async create(
    config: InProcessDeploymentConfig,
    spec: DeployableSpec
  ): Promise<UnlabelledHandle<C, InProcessLocator>> {
    const client = await this.bootstrap(config, spec as TSpec)
    return UnlabelledHandle.create({
      locator: Locator.create({ strategy: 'in-process' }),
      deployerKind: 'in-process',
      client,
    })
  }

  async connect(
    config: InProcessDeploymentConfig,
    spec: DeployableSpec
  ): Promise<UnlabelledHandle<C, InProcessLocator>> {
    // For in-process, reconnect = re-bootstrap from config + spec
    return this.create(config, spec)
  }

  async teardown() {
    // No need. Just drop the reference
  }
}
