/**
 * RPC socket server — JSONL over Unix socket, wrapping a dispatcher.
 *
 * Each connection is an independent RPC session. Requests arrive as JSONL
 * lines (RpcRequest), are dispatched, and responses (RpcResponse) are written
 * back as JSONL. Multiple in-flight requests per connection are supported via
 * the request `id` field.
 *
 * Extension point: the message parsing switch is designed to accommodate
 * future bidirectional prompting (server → client prompt requests).
 */

import { unlinkSync } from 'node:fs'
import type { RpcRequest, RpcResponse } from '@max/core'
import { BufferedSocket } from './util/buffered-socket.js'

export type RpcDispatchFn = (request: RpcRequest) => Promise<RpcResponse>

export interface RpcSocketServerOptions {
  socketPath: string
  dispatch: RpcDispatchFn
}

export interface RpcSocketServer {
  readonly socketPath: string
  stop(): void
}

export function createRpcSocketServer(opts: RpcSocketServerOptions): RpcSocketServer {
  const { socketPath, dispatch } = opts

  // Clean up stale socket
  try {
    unlinkSync(socketPath)
  } catch {
    // ignore if doesn't exist
  }

  interface ConnectionState {
    buffer: Uint8Array
    writer: BufferedSocket
  }

  const connections = new Map<object, ConnectionState>()

  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        connections.set(socket, { buffer: new Uint8Array(0), writer: new BufferedSocket(socket) })
      },
      drain(socket) {
        connections.get(socket)?.writer.drain()
      },

      data(socket, data) {
        const state = connections.get(socket)
        if (!state) return

        state.buffer = Buffer.concat([state.buffer, data])
        const result = Bun.JSONL.parseChunk(state.buffer)

        if (!result.values.length) return
        state.buffer = state.buffer.subarray(result.read)

        for (const msg of result.values) {
          const request = msg as RpcRequest
          dispatch(request).then((response) => {
            state.writer.write(JSON.stringify(response) + '\n')
          })
        }
      },

      close(socket) {
        connections.delete(socket)
      },

      error(_socket, err) {
        console.error('RPC socket error:', err)
      },
    },
  })

  return {
    socketPath,
    stop() {
      server.stop()
      try {
        unlinkSync(socketPath)
      } catch {
        // ignore
      }
    },
  }
}
