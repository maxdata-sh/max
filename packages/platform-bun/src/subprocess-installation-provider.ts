/**
 * SubprocessInstallationProvider — Spawns installations as child Bun processes.
 *
 * Each installation runs in its own subprocess, communicating via RPC over
 * a Unix socket. The provider spawns the current process with --subprocess
 * flags, reads the ready signal (socket path) from stdout, and connects
 * a SubprocessTransport wrapped in InstallationClientProxy.
 */

import * as os from 'node:os'
import * as path from 'node:path'
import { type InstallationId, type ProviderKind } from '@max/core'
import type { InstallationHandle, InstallationNodeProvider } from '@max/federation'
import { InstallationClientProxy, SubprocessTransport } from '@max/federation'

const SUBPROCESS_PROVIDER_KIND: ProviderKind = 'subprocess'

export interface SubprocessInstallationConfig {
  connector: string
  name?: string
  projectRoot: string
}

interface ManagedSubprocess {
  handle: InstallationHandle
  process: ReturnType<typeof Bun.spawn>
  transport: SubprocessTransport
}

export class SubprocessInstallationProvider implements InstallationNodeProvider {
  readonly kind = SUBPROCESS_PROVIDER_KIND
  private readonly managed = new Map<InstallationId, ManagedSubprocess>()

  async create(config: unknown): Promise<InstallationHandle> {
    const { connector, name, projectRoot } = config as SubprocessInstallationConfig

    const socketPath = path.join(
      os.tmpdir(),
      `max-inst-${connector}-${name ?? 'default'}-${crypto.randomUUID().slice(0, 8)}.sock`
    )

    const args = [
      '--subprocess',
      '--role', 'installation',
      '--connector', connector,
      '--project-root', projectRoot,
      '--socket-path', socketPath,
    ]
    if (name) {
      args.push('--name', name)
    }

    const proc = Bun.spawn([process.execPath, ...args], {
      stdout: 'pipe',
      stderr: 'inherit',
    })

    // Wait for ready signal from subprocess
    const reader = proc.stdout.getReader()
    const readyLine = await this.readReadySignal(reader)
    reader.releaseLock()

    const ready = JSON.parse(readyLine) as { socketPath: string; installationId: string }

    // Connect transport
    const transport = await SubprocessTransport.connect(ready.socketPath)
    const client = new InstallationClientProxy(transport)

    const handle: InstallationHandle = {
      id: ready.installationId as InstallationId,
      providerKind: SUBPROCESS_PROVIDER_KIND,
      client,
    }

    this.managed.set(handle.id, { handle, process: proc, transport })
    return handle
  }

  async connect(location: unknown): Promise<InstallationHandle> {
    const { socketPath, installationId } = location as { socketPath: string; installationId: string }

    const transport = await SubprocessTransport.connect(socketPath)
    const client = new InstallationClientProxy(transport)

    const handle: InstallationHandle = {
      id: installationId as InstallationId,
      providerKind: SUBPROCESS_PROVIDER_KIND,
      client,
    }

    // No process to manage — external
    this.managed.set(handle.id, { handle, process: null as any, transport })
    return handle
  }

  async list(): Promise<InstallationHandle[]> {
    return [...this.managed.values()].map((m) => m.handle)
  }

  async terminate(id: InstallationId): Promise<void> {
    const entry = this.managed.get(id)
    if (!entry) return
    await entry.transport.close()
    entry.process?.kill()
    this.managed.delete(id)
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
