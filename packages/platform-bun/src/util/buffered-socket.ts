/**
 * BufferedWriter — handles partial writes on Bun sockets.
 *
 * Bun's socket.write() returns the number of bytes actually written.
 * When the internal buffer is full (8 KB), it writes fewer bytes than
 * requested and the caller must retry the remainder on the next drain
 * callback. This class queues unwritten bytes and flushes them in order.
 */

interface Writable {
  write(data: string | Uint8Array): number
  end(): void
}

export class BufferedSocket {
  private queue: Uint8Array[] = []
  private ending = false
  private endResolve: (() => void) | null = null

  constructor(private socket: Writable) {}

  /** Write data, queuing any bytes the socket couldn't accept. */
  write(data: string): void {
    const bytes = Buffer.from(data)

    if (this.queue.length > 0) {
      // Already queued — preserve ordering
      this.queue.push(bytes)
      return
    }

    const written = this.socket.write(bytes)
    if (written < bytes.length) {
      this.queue.push(bytes.subarray(written))
    }
  }

  /** Called from Bun's drain socket callback. Flushes queued chunks. */
  drain(): void {
    while (this.queue.length > 0) {
      const chunk = this.queue[0]
      const written = this.socket.write(chunk)
      if (written === 0) return // buffer still full
      if (written < chunk.length) {
        this.queue[0] = chunk.subarray(written)
        return
      }
      this.queue.shift()
    }

    // Queue empty — if end() was requested, close now
    if (this.ending) {
      this.socket.end()
      if (this.endResolve) {
        this.endResolve()
        this.endResolve = null
      }
    }
  }

  /** Close the socket once all queued data has been flushed. */
  end(): Promise<void> {
    if (this.queue.length === 0) {
      this.socket.end()
      return Promise.resolve()
    }
    this.ending = true
    return new Promise((resolve) => { this.endResolve = resolve })
  }
}
