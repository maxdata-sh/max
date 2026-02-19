/**
 * InstallationClientProxy — Caller-side proxy for InstallationClient.
 *
 * Composes SupervisedProxy + EngineProxy into a complete InstallationClient
 * surface. sync() sends an RPC and wraps the response in a RemoteSyncHandle.
 *
 * Schema is a constructor parameter — the proxy is never in an invalid state.
 * The provider fetches schema during connect()/create() before constructing
 * the proxy.
 */

import {
  SupervisedProxy,
  EngineProxy,
  type Transport,
  type RpcRequest,
  type Schema,
  type Engine,
  type InstallationScope,
  type HealthStatus,
  type StartResult,
  type StopResult,
} from "@max/core"
import type { SyncHandle } from "@max/execution"
import type { InstallationClient, InstallationDescription } from "./installation-client.js"
import { RemoteSyncHandle } from "./remote-sync-handle.js"

export class InstallationClientProxy implements InstallationClient {
  private readonly supervised: SupervisedProxy
  readonly engine: Engine<InstallationScope>

  constructor(private readonly transport: Transport) {
    this.supervised = new SupervisedProxy(transport)
    this.engine = new EngineProxy(transport)
  }

  describe(): Promise<InstallationDescription> {
    return this.rpc('describe')
  }

  schema(): Promise<Schema> {
    return this.rpc('schema')
  }

  health(): Promise<HealthStatus> {
    return this.supervised.health()
  }

  start(): Promise<StartResult> {
    return this.supervised.start()
  }

  stop(): Promise<StopResult> {
    return this.supervised.stop()
  }

  async sync(): Promise<SyncHandle> {
    const info : {
      id: any
      plan: any
      startedAt: string
    } = await this.rpc("sync")
    return new RemoteSyncHandle(this.transport, info)
  }

  protected rpc(method: string, ...args: unknown[]): Promise<any> {
    const request: RpcRequest = { id: crypto.randomUUID(), target: '', method, args }
    return this.transport.send(request)
  }
}
