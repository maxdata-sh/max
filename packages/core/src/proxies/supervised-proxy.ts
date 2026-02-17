/**
 * SupervisedProxy — Proxies Supervised (health/start/stop) over a Transport.
 *
 * Reusable by all client proxies. Every client extends Supervised,
 * so every client proxy composes with this.
 *
 * Owned by the Supervised interface, not by any provider package.
 */

import type { Transport } from "../federation/transport.js"
import type { RpcRequest } from "../federation/rpc.js"
import type { Supervised } from "../federation/supervised.js"
import type { HealthStatus } from "../federation/supervised.js"
import type { StartResult } from "../federation/supervised.js"
import type { StopResult } from "../federation/supervised.js"

export class SupervisedProxy implements Supervised {
  constructor(
    private readonly transport: Transport,
    private readonly target: string = "",
  ) {}

  async health(): Promise<HealthStatus> {
    return this.rpc("health")
  }

  async start(): Promise<StartResult> {
    return this.rpc("start")
  }

  async stop(): Promise<StopResult> {
    return this.rpc("stop")
  }

  protected rpc(method: string, ...args: unknown[]): Promise<any> {
    const request: RpcRequest = { id: crypto.randomUUID(), target: this.target, method, args }
    return this.transport.send(request)
  }
}
