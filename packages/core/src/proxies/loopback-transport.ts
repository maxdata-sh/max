/**
 * LoopbackTransport — Test utility for proxy+handler roundtrip testing.
 *
 * Takes a dispatch function that mirrors what a real dispatcher does:
 * receives an RpcRequest, returns an RpcResponse. The loopback transport
 * calls it in-memory, unwraps the response, and returns the result
 * (or throws a reconstituted error).
 *
 * This lets proxy+handler pairs be tested without any real transport,
 * socket, or process boundary.
 */

import type { Transport } from "../federation/transport.js"
import type { RpcRequest } from "../federation/rpc.js"
import type { RpcResponse } from "../federation/rpc.js"
import { MaxError } from "../max-error.js"

export type DispatchFn = (request: RpcRequest) => Promise<RpcResponse>

export class LoopbackTransport implements Transport {
  constructor(private readonly dispatch: DispatchFn) {}

  async send(request: RpcRequest): Promise<unknown> {
    const response = await this.dispatch(request)
    if (response.ok) {
      return response.result
    }
    throw MaxError.reconstitute(response.error)
  }

  async close(): Promise<void> {
    // No-op — no real connection to close
  }
}
