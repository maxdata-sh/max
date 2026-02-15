import { unlinkSync } from 'fs'
import type { ShellCompletion } from '@optique/core/completion'
import * as Completion from '@optique/core/completion'
import type { CliRequest, CliResponse } from './types.js'

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
}

export interface SocketServerOptions {
  socketPath: string
  runner: (req: CliRequest) => Promise<CliResponse>
}

export function createSocketServer(opts: SocketServerOptions): { stop: () => void } {
  const { socketPath, runner } = opts

  // Clean up old socket
  try {
    unlinkSync(socketPath)
  } catch (e) {
    // ignore if doesn't exist
  }

  async function handleRequest(req: CliRequest): Promise<CliResponse> {
    if (req.kind === 'complete') {
      // FIXME: CLAUDE: We need to implement suggestion. This is the old code:
      throw 'no'
      // const suggestions = await runner.suggest(req.argv)
      // const shell = req.shell && shells[req.shell]
      // if (shell) {
      //   const chunks: string[] = []
      //   for (const chunk of shell.encodeSuggestions(suggestions)) {
      //     chunks.push(chunk)
      //   }
      //   return { exitCode: 0, completionOutput: chunks.join('\n') }
      // }
      // // Fallback: plain string completions
      // const completions = suggestions.filter((s) => s.kind === 'literal').map((s) => s.text)
      // return { exitCode: 0, completions }
    }
    return runner(req)
  }

  // Per-connection JSONL buffers. Data may arrive in chunks, so we
  // accumulate and use Bun.JSONL.parseChunk to extract complete objects.
  // This avoids an async race: if the client sends FIN (shutdown(Write))
  // while our async handler is awaiting, Bun tears down the socket and
  // socket.write() silently fails. Using a newline delimiter means the
  // client keeps the socket open for the response.
  const buffers = new Map<object, string>()

  async function processRequest(
    socket: { write(data: string): number; end(): void },
    request: CliRequest
  ) {
    try {
      const response = await handleRequest(request)
      socket.write(JSON.stringify(response))
      socket.end()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      socket.write(JSON.stringify({ stderr: `Parse error: ${msg}\n`, exitCode: 1 }))
      socket.end()
    }
  }

  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        buffers.set(socket, '')
      },
      data(socket, data) {
        const prev = buffers.get(socket) ?? ''
        const text = prev + Buffer.from(data).toString('utf-8')

        const result = Bun.JSONL.parseChunk(text)
        if (result.values.length === 0) {
          // Incomplete request — keep buffering
          buffers.set(socket, text)
          return
        }

        // Complete request received
        buffers.delete(socket)
        processRequest(socket, result.values[0] as CliRequest)
      },
      close(socket) {
        buffers.delete(socket)
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
