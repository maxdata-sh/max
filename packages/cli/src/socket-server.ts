import { unlinkSync } from 'fs'
import { BufferedSocket } from '@max/platform-bun'
import type { CliRequest, CliResponse } from './types.js'
import {
  SocketPrompter,
  type DaemonMessage,
  type ShimInput,
  type Prompter,
  PromptableSocket,
} from './prompter.js'

export interface SocketServerOptions {
  socketPath: string
  handler: (req: CliRequest, prompter: Prompter) => Promise<CliResponse>
}

export function createSocketServer(opts: SocketServerOptions): { stop: () => void } {
  const { socketPath, handler } = opts

  // Clean up old socket
  try {
    unlinkSync(socketPath)
  } catch (e) {
    // ignore if doesn't exist
  }

  /**
   * Per-connection state. Tracks:
   *   - JSONL buffer for chunked data
   *   - Whether the initial request has been received
   *   - A pending resolver for when the command is waiting on user input
   */
  interface ConnectionState {
    buffer: Uint8Array
    initiated: boolean
    pendingInput: ((msg: ShimInput) => void) | null
    writer: BufferedSocket | null
  }

  const connections = new Map<object, ConnectionState>()

  function wrapSocket(state: ConnectionState): PromptableSocket {
    return {
      send(msg: DaemonMessage): void {
        state.writer!.write(JSON.stringify(msg) + '\n')
      },
      receive(): Promise<ShimInput> {
        return new Promise((resolve) => {
          state.pendingInput = resolve
        })
      },
    }
  }

  async function processRequest(
    state: ConnectionState,
    request: CliRequest
  ) {
    const socket = wrapSocket(state)
    const prompter = new SocketPrompter(socket)

    try {
      const response = await handler(request, prompter)
      socket.send({ kind: 'response', ...response })
      await state.writer!.end()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      socket.send({ kind: 'response', stderr: `Error: ${msg}\n`, exitCode: 1 })
      await state.writer!.end()
    }
  }

  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        connections.set(socket, {
          buffer: new Uint8Array(0),
          initiated: false,
          pendingInput: null,
          writer: new BufferedSocket(socket),
        })
      },
      drain(socket) {
        connections.get(socket)?.writer?.drain()
      },
      data(socket, data) {
        const state = connections.get(socket)
        if (!state) return

        state.buffer = Buffer.concat([state.buffer, data])
        const result = Bun.JSONL.parseChunk(state.buffer)

        if (!result.values.length) {
          return
        }

        state.buffer = state.buffer.subarray(result.read)

        for (const input of result.values) {
          const msg = input as Record<string, unknown>
          if (!state.initiated) {
            state.initiated = true
            processRequest(state, msg as CliRequest)
          } else if (state.pendingInput && msg.kind === 'input') {
            const resolver = state.pendingInput
            state.pendingInput = null
            resolver(msg as ShimInput)
          }
        }
      },
      close(socket) {
        connections.delete(socket)
      },
      error(_socket, err) {
        console.error('Socket error:', err)
      },
    },
  })

  return {
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
