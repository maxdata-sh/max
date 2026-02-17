/**
 * InstallationDispatcher — Entry point for all RPC calls to an installation node.
 *
 * Composes SupervisedHandler + EngineHandler. Routes by target:
 *   ""       → root (supervised methods + sync + schema)
 *   "engine" → engine handler
 *
 * Sync handle operations are regular root methods with syncId as the first
 * argument — no separate proxy+handler pair. The dispatcher tracks live
 * handles in a Map as an implementation detail.
 */

import {
  EngineHandler,
  SupervisedHandler,
  MaxError,
  RpcResponse,
  ErrUnknownTarget,
  ErrUnknownMethod,
  ErrSyncHandleNotFound,
  type RpcRequest,
  type InstallationScope,
} from "@max/core"
import type { SyncHandle, SyncId } from "@max/execution"
import type { InstallationClient } from "../protocols/installation-client.js"

export class InstallationDispatcher {
  private readonly supervised: SupervisedHandler
  private readonly engine: EngineHandler<InstallationScope>
  private readonly syncHandles = new Map<SyncId, SyncHandle>()

  constructor(private readonly node: InstallationClient) {
    this.supervised = new SupervisedHandler(node)
    this.engine = new EngineHandler(node.engine)
  }

  async dispatch(request: RpcRequest): Promise<RpcResponse> {
    try {
      const result = await this.route(request)
      return RpcResponse.ok(request.id, result)
    } catch (err) {
      return RpcResponse.error(request.id, MaxError.serialize(err))
    }
  }

  private route(request: RpcRequest): Promise<unknown> {
    const { target, method, args } = request

    switch (target) {
      case "":
        return this.dispatchRoot(method, args)
      case "engine":
        return this.engine.dispatch(method, args)
      default:
        throw ErrUnknownTarget.create({ target })
    }
  }

  private dispatchRoot(method: string, args: readonly unknown[]): Promise<unknown> {
    switch (method) {
      // Supervised
      case "health":
      case "start":
      case "stop":
        return this.supervised.dispatch(method, args)

      // Schema (property access)
      case "schema":
        return Promise.resolve(this.node.schema)

      // Sync — returns handle data, registers server-side handle
      case "sync":
        return this.startSync()

      // Sync handle operations — syncId is the first argument
      case "syncStatus":
      case "syncPause":
      case "syncCancel":
      case "syncCompletion":
        return this.dispatchSyncMethod(method, args)

      default:
        throw ErrUnknownMethod.create({ target: "root", method })
    }
  }

  private async startSync(): Promise<unknown> {
    const handle = await this.node.sync()
    this.syncHandles.set(handle.id, handle)
    return {
      id: handle.id,
      plan: handle.plan,
      startedAt: handle.startedAt.toISOString(),
    }
  }

  private dispatchSyncMethod(method: string, args: readonly unknown[]): Promise<unknown> {
    const syncId = args[0] as SyncId
    const handle = this.syncHandles.get(syncId)
    if (!handle) throw ErrSyncHandleNotFound.create({ syncId })

    switch (method) {
      case "syncStatus":
        return handle.status()
      case "syncPause":
        return handle.pause()
      case "syncCancel":
        return handle.cancel().then(() => {
          this.syncHandles.delete(syncId)
        })
      case "syncCompletion":
        return handle.completion().then((result) => {
          this.syncHandles.delete(syncId)
          return result
        })
      default:
        throw ErrUnknownMethod.create({ target: "sync", method })
    }
  }
}
