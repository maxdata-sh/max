/**
 * Transport — Typed message passing over a persistent connection.
 *
 * The pipe between a caller and a single node. One transport per node.
 * Requests are multiplexed using the `id` field — multiple in-flight
 * requests share the connection.
 *
 * `send` takes a typed RpcRequest. The transport reads the `id` field
 * for response matching but does NOT interpret the request contents
 * (target, method, args, scope). It is a dumb pipe that knows the
 * envelope shape.
 *
 * Implementations:
 *   - LoopbackTransport: test utility, dispatches in-memory
 *   - SubprocessTransportClient: JSONL over Unix socket
 *   - HttpTransport: HTTP to a remote server
 *   - DockerTransport: mapped port or socket to a container
 */

import type { RpcRequest } from "./rpc.js"

export interface Transport {
  send(request: RpcRequest): Promise<unknown>
  close(): Promise<void>
}
