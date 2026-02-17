/**
 * WorkspaceDispatcher — Entry point for all RPC calls to a workspace node.
 *
 * Routes by scope and target:
 * - If scope.installationId is present → delegate to InstallationDispatcher
 * - Otherwise → handle workspace-level methods (supervised + workspace operations)
 *
 * Caches InstallationDispatchers per installation to avoid reconstruction.
 */

import {
  SupervisedHandler,
  MaxError,
  RpcResponse,
  ErrUnknownTarget,
  ErrUnknownMethod,
  ErrNodeNotFound,
  type RpcRequest,
  type InstallationId,
} from "@max/core"
import type { WorkspaceClient } from "../protocols/workspace-client.js"
import { InstallationDispatcher } from "./installation-dispatcher.js"

export class WorkspaceDispatcher {
  private readonly supervised: SupervisedHandler
  private readonly installationDispatchers = new Map<InstallationId, InstallationDispatcher>()

  constructor(private readonly node: WorkspaceClient) {
    this.supervised = new SupervisedHandler(node)
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
    // Scope routing: if installationId is present, route to that installation
    if (request.scope?.installationId) {
      return this.routeToInstallation(request)
    }

    const { target, method, args } = request

    switch (target) {
      case "":
        return this.dispatchRoot(method, args)
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

      // Workspace operations
      case "listInstallations":
        return this.node.listInstallations()

      case "createInstallation":
        return this.node.createInstallation(args[0] as any)

      case "removeInstallation":
        return this.node.removeInstallation(args[0] as InstallationId)

      default:
        throw ErrUnknownMethod.create({ target: "root", method })
    }
  }

  private async routeToInstallation(request: RpcRequest): Promise<unknown> {
    const installationId = request.scope!.installationId!
    const inst = this.node.installation(installationId)
    if (!inst) throw ErrNodeNotFound.create({ id: installationId })

    // Strip installationId from scope and dispatch as if talking directly to the installation
    const innerRequest: RpcRequest = {
      ...request,
      scope: request.scope?.workspaceId
        ? { workspaceId: request.scope.workspaceId }
        : undefined,
    }

    // Reuse or create an InstallationDispatcher for this installation
    let dispatcher = this.installationDispatchers.get(installationId)
    if (!dispatcher) {
      dispatcher = new InstallationDispatcher(inst)
      this.installationDispatchers.set(installationId, dispatcher)
    }

    const response = await dispatcher.dispatch(innerRequest)

    // Unwrap — we're already inside a try/catch at this level
    if (response.ok) return response.result
    throw MaxError.reconstitute(response.error)
  }
}
