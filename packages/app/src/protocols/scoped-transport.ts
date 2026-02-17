/**
 * ScopedTransport — Adds scope routing context to every outgoing request.
 *
 * Wraps an inner transport and merges scope fields (installationId, workspaceId)
 * onto every request. Mirrors how scope upgrade stamps identity on data flowing
 * up — scope routing stamps destination on requests flowing down.
 *
 * Usage:
 *   new ScopedTransport(workspaceTransport, { installationId: id })
 *   new ScopedTransport(globalTransport, { workspaceId: id })
 */

import type { Transport, RpcRequest, ScopeRouting } from "@max/core"

export class ScopedTransport implements Transport {
  constructor(
    private readonly inner: Transport,
    private readonly addScope: Partial<ScopeRouting>,
  ) {}

  async send(request: RpcRequest): Promise<unknown> {
    return this.inner.send({
      ...request,
      scope: { ...request.scope, ...this.addScope },
    })
  }

  async close(): Promise<void> {
    // No-op — inner transport lifecycle is shared
  }
}
