import {Deployer, DeployerKind, Locator, Supervised, Transport, UnlabelledHandle} from '@max/core'
import {DeployableSpec} from '@max/federation'
import * as path from 'node:path'
import {BunDaemonTransport} from '../../transports/bun-daemon-transport.js'
import {DaemonDeploymentConfig} from "../types.js";

export interface DaemonLocator extends Locator {
  strategy: 'daemon'
  socketPath: string
}

export class DaemonDeployer<C extends Supervised> implements Deployer<
  C,
  DaemonDeploymentConfig,
  DaemonLocator
> {
  readonly deployerKind = DeployerKind.create<DaemonDeploymentConfig>('daemon')

  constructor(
    private buildProxy: (transport: Transport) => C,
    private role: 'installation' | 'workspace'
  ) {}

  // TODO: Are we re-implementing Resolver flow here..?
  private getInstallationName(spec: DeployableSpec): string {
    return spec.name ?? 'default'
  }

  private getSocketPath(config: DaemonDeploymentConfig, spec: DeployableSpec): string {
    const name = this.getInstallationName(spec)
    return config.socketPath ?? path.join(config.daemonDir, `max-${this.role}-${name}.sock`)
  }

  async create(
    config: DaemonDeploymentConfig,
    spec: DeployableSpec
  ): Promise<UnlabelledHandle<C, DaemonLocator>> {

    const socketPath = this.getSocketPath(config,spec)

    // Serialize spec as base64 JSON for the child process
    const specJson = Buffer.from(JSON.stringify(spec)).toString('base64')

    const args = [
      // TODO: Now that we have "locators" and deployment strategies, we should re-think how bootstrapping works
      //  and what naming conventions and terminology (e.g. "subprocess"? not anymore)
      '--subprocess',
      '--role',
      this.role,
      '--spec',
      specJson,
      '--data-root',
      config.dataRoot,
      '--socket-path',
      socketPath,
    ]

    // Spawn a new OS process
    const proc = Bun.spawn([process.execPath, ...args], {
      stdout: 'pipe',
      stderr: 'inherit',
    })

    // Wait for ready signal from subprocess
    const reader = proc.stdout.getReader()
    const readyLine = await BunDaemonTransport.awaitReadySignal(reader)
    reader.releaseLock()

    const ready = JSON.parse(readyLine) as { socketPath: string }

    // 2. Connect transport over Unix socket
    const transport = await BunDaemonTransport.connect(socketPath)

    // 3. Build proxy client over transport (C-specific logic is injected)
    const client = this.buildProxy(transport)

    return UnlabelledHandle.create({
      client,
      deployerKind: 'daemon',
      locator: { strategy: 'daemon', socketPath },
    })
  }

  async connect(config: DaemonDeploymentConfig, spec: DeployableSpec): Promise<UnlabelledHandle<C, DaemonLocator>> {
    // Reconnect to an existing subprocess — find its socket, build proxy
    const socketPath = this.getSocketPath(config, spec)
    try {
      const transport = await BunDaemonTransport.connect(socketPath)
      const client = this.buildProxy(transport)
      return UnlabelledHandle.create({
        client,
        deployerKind: 'daemon',
        locator: { strategy: 'daemon', socketPath },
      })
    }catch (e){
      return this.create(config,spec)
    }
  }

  async teardown(config: DaemonDeploymentConfig, spec: DeployableSpec): Promise<void> {}
}
