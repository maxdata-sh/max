import {
  Deployer,
  DeployerKind,
  ErrNotImplemented,
  Locator,
  Supervised,
  Transport,
  UnlabelledHandle,
} from '@max/core'
import {DockerDeploymentConfig} from "../types.js";

export interface DockerLocator extends Locator {
  strategy: 'docker'
}

export class DockerDeployer<C extends Supervised> implements Deployer<
  C,
  DockerDeploymentConfig,
  DockerLocator
> {
  static readonly deployerKind = DeployerKind.create<DockerDeploymentConfig>('docker')
  deployerKind = DockerDeployer.deployerKind

  constructor(private buildProxy: (transport: Transport) => C) {
    throw ErrNotImplemented.create({}, 'Docker support not yet added')
  }

  async create(_config: unknown): Promise<any> {
    throw ErrNotImplemented.create({}, 'Docker support not yet added')
  }

  async connect(): Promise<UnlabelledHandle<C, DockerLocator>> {
    throw ErrNotImplemented.create({}, 'Docker support not yet added')
  }

  async teardown() {}
}
