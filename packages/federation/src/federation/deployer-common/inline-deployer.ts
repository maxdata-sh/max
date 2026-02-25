import { Deployer, DeployerKind, Locator, Supervised, UnlabelledHandle } from '@max/core'
import { DeployableSpec, DeploymentConfig } from '../../deployers/index.js'

export interface InProcessLocator extends Locator {
  strategy: 'inline'
}

export interface InlineDeployerConfig extends DeploymentConfig {
  strategy: 'inline'
}

const INLINE = 'inline' as const

/** Really basic inline deployer that just runs the callback provided to it.
 *  Useful for testing / stubbing. Could / should easily replace the Bun platform's "in-process"
 *  because ultimately, ever lowest-level deployment needs to just run a handler.
 */
export class InlineDeployer<C extends Supervised, TSpec extends DeployableSpec> implements Deployer<
  C,
  InlineDeployerConfig,
  InProcessLocator,
  TSpec
> {
  static readonly deployerKind = DeployerKind.create<InlineDeployerConfig>('inline')
  deployerKind = InlineDeployer.deployerKind

  constructor(private bootstrap: (config: InlineDeployerConfig, spec: TSpec) => Promise<C>) {}

  async create(
    config: InlineDeployerConfig,
    spec: DeployableSpec
  ): Promise<UnlabelledHandle<C, InProcessLocator>> {
    const client = await this.bootstrap(config, spec as TSpec)
    return UnlabelledHandle.create({
      locator: Locator.create({ strategy: INLINE }),
      deployerKind: INLINE,
      client,
    })
  }

  async connect(
    config: InlineDeployerConfig,
    spec: DeployableSpec
  ): Promise<UnlabelledHandle<C, InProcessLocator>> {
    // For in-process, reconnect = re-bootstrap from config + spec
    return this.create(config, spec)
  }

  async teardown() {
    // No need. Just drop the reference
  }
}
