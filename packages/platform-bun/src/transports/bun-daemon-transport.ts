/**
 * BunDaemonTransport — Transport implementation over a Unix socket.
 *
 * Connects to an RPC socket server, sends RpcRequests as JSONL,
 * and matches responses by request ID. Supports multiple in-flight
 * requests over a single persistent connection.
 *
 * Extension point: the message parsing switch is designed to accommodate
 * future bidirectional prompting (server → client prompt requests).
 */

import { MaxError, type RpcRequest, type RpcResponse, type Transport } from '@max/core'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export class BunDaemonTransport implements Transport {
  private socket: ReturnType<typeof Bun.connect> extends Promise<infer T> ? T : never
  private readonly pending = new Map<string, PendingRequest>()
  private buffer = new Uint8Array(0)
  private requestCounter = 0

  private constructor(socket: BunDaemonTransport['socket']) {
    this.socket = socket
  }

  /**
   * Connect to an RPC socket server at the given Unix socket path.
   */
  static async connect(socketPath: string): Promise<BunDaemonTransport> {
    let transport: BunDaemonTransport

    const socket = await Bun.connect({
      unix: socketPath,
      socket: {
        data(_socket, data) {
          transport!.onData(data)
        },
        close() {
          transport!.onClose()
        },
        error(_socket, err) {
          console.error('BunDaemonTransport socket error:', err)
        },
        open() {},
      },
    })

    transport = new BunDaemonTransport(socket)
    return transport
  }

  async send(request: RpcRequest): Promise<unknown> {
    const id = request.id || this.nextId()
    const wire = { ...request, id }

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.write(JSON.stringify(wire) + '\n')
    })
  }

  async close(): Promise<void> {
    this.socket.end()
    // Reject any pending requests
    for (const [id, pending] of this.pending) {
      pending.reject(new Error(`Transport closed with pending request ${id}`))
    }
    this.pending.clear()
  }

  private nextId(): string {
    return `req_${++this.requestCounter}`
  }

  private onData(data: Uint8Array) {
    this.buffer = Buffer.concat([this.buffer, data])
    const result = Bun.JSONL.parseChunk(this.buffer)

    if (!result.values.length) return
    this.buffer = this.buffer.subarray(result.read)

    for (const msg of result.values) {
      // Extension point: discriminate message types here
      // For now, all incoming messages are RpcResponses
      const response = msg as RpcResponse
      const pending = this.pending.get(response.id)
      if (!pending) continue

      this.pending.delete(response.id)

      if (response.ok) {
        pending.resolve(response.result)
      } else {
        pending.reject(MaxError.reconstitute(response.error))
      }
    }
  }

  private onClose() {
    for (const [id, pending] of this.pending) {
      pending.reject(new Error(`Connection closed with pending request ${id}`))
    }
    this.pending.clear()
  }

  static async awaitReadySignal(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
    let accumulated = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        // FIXME: This needs a MaxError
        throw new Error('Daemon exited before sending ready signal')
      }

      accumulated += new TextDecoder().decode(value)
      const newlineIdx = accumulated.indexOf('\n')
      if (newlineIdx !== -1) {
        return accumulated.slice(0, newlineIdx).trim()
      }
    }
  }
}
