import { unlinkSync } from 'fs'
import type { CliRequest, CliResponse } from './types.js'
import { SocketPrompter, type DaemonMessage, type ShimInput, type Prompter } from './prompter.js'

export interface SocketServerOptions {
  socketPath: string
  runner: (req: CliRequest, prompter: Prompter) => Promise<CliResponse>
  suggest: (req: CliRequest) => Promise<CliResponse>
}

export function createSocketServer(opts: SocketServerOptions): { stop: () => void } {
  const { socketPath, runner, suggest } = opts

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
    buffer: string
    initiated: boolean
    pendingInput: ((msg: ShimInput) => void) | null
  }

  const connections = new Map<object, ConnectionState>()

  function wrapSocket(raw: { write(data: string): number; end(): void }, state: ConnectionState): PromptableSocket {
    return {
      send(msg: DaemonMessage): void {
        raw.write(JSON.stringify(msg) + '\n')
      },
      receive(): Promise<ShimInput> {
        return new Promise((resolve) => {
          state.pendingInput = resolve
        })
      },
    }
  }

  async function processRequest(
    raw: { write(data: string): number; end(): void },
    state: ConnectionState,
    request: CliRequest
  ) {
    const socket = wrapSocket(raw, state)
    const prompter = new SocketPrompter(socket)

    try {
      let response: CliResponse

      if (request.kind === 'complete') {
        response = await suggest(request)
      } else {
        response = await runner(request, prompter)
      }

      socket.send({ kind: 'response', ...response })
      raw.end()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      socket.send({ kind: 'response', stderr: `Error: ${msg}\n`, exitCode: 1 })
      raw.end()
    }
  }

  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        connections.set(socket, { buffer: '', initiated: false, pendingInput: null })
      },
      data(socket, data) {
        const state = connections.get(socket)
        if (!state) return

        const text = state.buffer + Buffer.from(data).toString('utf-8')
        const result = Bun.JSONL.parseChunk(text)

        if (result.values.length === 0) {
          state.buffer = text
          return
        }

        state.buffer = result.rest ?? ''
        const msg = result.values[0] as Record<string, unknown>

        if (!state.initiated) {
          // First message is the request
          state.initiated = true
          processRequest(socket, state, msg as unknown as CliRequest)
        } else if (state.pendingInput && msg.kind === 'input') {
          // Subsequent messages are input responses
          const resolver = state.pendingInput
          state.pendingInput = null
          resolver(msg as unknown as ShimInput)
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
