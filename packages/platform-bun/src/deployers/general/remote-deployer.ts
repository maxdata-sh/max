import { Deployer, DeployerKind, Locator, Supervised, Transport, UnlabelledHandle } from '@max/core'
import { DeployableSpec, ErrCreateNotSupported } from '@max/federation'
import { HttpTransport } from '../../transports/http-transport.js'
import {RemoteDeploymentConfig} from "../types.js";

export interface RemoteLocator extends Locator {
  strategy: 'remote'
  url: string
}

/** FIXME Pretty platform-agnostic - can probably go in @max/federation. Needs an http transport supplied to it */
export class RemoteDeployer<C extends Supervised> implements Deployer<C, RemoteDeploymentConfig> {
  static readonly deployerKind = DeployerKind.create<RemoteDeploymentConfig>('remote')
  deployerKind = RemoteDeployer.deployerKind

  constructor(private buildProxy: (transport: Transport) => C) {}

  async create(config: RemoteDeploymentConfig, spec: DeployableSpec): Promise<any> {
    throw ErrCreateNotSupported.create({ deployerKind: 'remote' })
  }

  async connect(config: RemoteDeploymentConfig, spec: DeployableSpec) {
    const transport = await HttpTransport.connect(config.url)
    const client = this.buildProxy(transport)
    return UnlabelledHandle.create({
      client,
      deployerKind: 'remote',
      locator: Locator.create<RemoteLocator>({ strategy: 'remote', url: config.url }),
    })
  }

  async teardown() {
    // Remote nodes are externally managed — we just disconnect
  }
}
