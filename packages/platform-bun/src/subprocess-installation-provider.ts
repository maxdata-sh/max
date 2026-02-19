/**
 * SubprocessInstallationProvider — Spawns installations as child Bun processes.
 *
 * Each installation runs in its own subprocess, communicating via RPC over
 * a Unix socket. The provider serializes the InstallationSpec as a base64
 * JSON arg to the child. The child runs BunInProcessProvider internally to
 * resolve and wire the installation.
 *
 * The provider is a stateless factory from the federation's perspective —
 * it returns UnlabelledHandles. It does keep an internal map of managed
 * subprocesses for lifecycle (terminate), but this is not exposed via the
 * NodeProvider interface.
 */

import * as os from 'node:os'
import * as path from 'node:path'
import { type ProviderKind, type UnlabelledHandle } from '@max/core'
import type { InstallationNodeProvider } from '@max/federation'
import type { InstallationSpec } from '@max/federation'
import { InstallationClientProxy, SubprocessTransport } from '@max/federation'
import type { InstallationClient } from '@max/federation'

const SUBPROCESS_PROVIDER_KIND: ProviderKind = 'subprocess'

interface ManagedSubprocess {
  process: ReturnType<typeof Bun.spawn>
  transport: SubprocessTransport
  socketPath: string
}

export class SubprocessInstallationProvider implements InstallationNodeProvider {
  readonly kind = SUBPROCESS_PROVIDER_KIND

  /** The data root passed to child processes for resolution. */
  private readonly dataRoot: string

  /** Internal lifecycle tracking — not part of NodeProvider interface. */
  private readonly managed: ManagedSubprocess[] = []

  constructor(opts: { dataRoot: string }) {
    this.dataRoot = opts.dataRoot
  }

  async create(spec: InstallationSpec): Promise<UnlabelledHandle<InstallationClient>> {
    const name = spec.name ?? spec.connector

    const socketPath = path.join(
      os.tmpdir(),
      `max-inst-${spec.connector}-${name}-${crypto.randomUUID().slice(0, 8)}.sock`
    )

    // Serialize spec as base64 JSON for the child process
    const specJson = Buffer.from(JSON.stringify(spec)).toString('base64')

    const args = [
      '--subprocess',
      '--role', 'installation',
      '--spec', specJson,
      '--data-root', this.dataRoot,
      '--socket-path', socketPath,
    ]

    const proc = Bun.spawn([process.execPath, ...args], {
      stdout: 'pipe',
      stderr: 'inherit',
    })

    // Wait for ready signal from subprocess
    const reader = proc.stdout.getReader()
    const readyLine = await this.readReadySignal(reader)
    reader.releaseLock()

    const ready = JSON.parse(readyLine) as { socketPath: string }

    // Connect transport
    const transport = await SubprocessTransport.connect(ready.socketPath)
    const client = new InstallationClientProxy(transport)

    this.managed.push({ process: proc, transport, socketPath: ready.socketPath })

    return { providerKind: SUBPROCESS_PROVIDER_KIND, client }
  }

  async connect(location: unknown): Promise<UnlabelledHandle<InstallationClient>> {
    const { socketPath } = location as { socketPath: string }

    const transport = await SubprocessTransport.connect(socketPath)
    const client = new InstallationClientProxy(transport)

    return { providerKind: SUBPROCESS_PROVIDER_KIND, client }
  }

  /** Diagnostic / lifecycle — terminate all managed subprocesses. */
  async terminateAll(): Promise<void> {
    for (const entry of this.managed) {
      await entry.transport.close()
      entry.process?.kill()
    }
    this.managed.length = 0
  }

  private async readReadySignal(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
    let accumulated = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        // FIXME: This needs a MaxError
        throw new Error('Subprocess exited before sending ready signal')
      }

      accumulated += new TextDecoder().decode(value)
      const newlineIdx = accumulated.indexOf('\n')
      if (newlineIdx !== -1) {
        return accumulated.slice(0, newlineIdx).trim()
      }
    }
  }
}
