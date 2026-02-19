/**
 * Subprocess entry point — runs an installation node in a child process.
 *
 * Invoked with: max --subprocess --role=installation --spec=<base64>
 *               --data-root=/path --socket-path=/tmp/max-inst-xxx.sock
 *
 * Uses BunInProcessInstallationProvider to resolve spec → concrete deps and bootstrap
 * the installation. Wraps it in an InstallationDispatcher, starts an RPC
 * socket server, and writes a ready signal to stdout so the parent can connect.
 */

import { flag } from '@optique/core'
import { object } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { withDefault } from '@optique/core/modifiers'
import { string } from '@optique/core/valueparser'
import {
  createRpcSocketServer,
  FsConnectorRegistry,
  InstallationDispatcher,
} from '@max/federation'
import type { InstallationSpec } from '@max/federation'
import { BunInProcessInstallationProvider } from '@max/platform-bun'

export const subprocessParsers = object({
  subprocess: flag('--subprocess'),
  role: withDefault(option('--role', string()), 'installation'),
  spec: withDefault(option('--spec', string()), ''),
  dataRoot: withDefault(option('--data-root', string()), ''),
  socketPath: withDefault(option('--socket-path', string()), ''),
})

export interface SubprocessArgs {
  role: string
  spec: string
  dataRoot: string
  socketPath: string
}

export async function runSubprocess(args: SubprocessArgs): Promise<void> {
  if (args.role !== 'installation') {
    console.error(`Unknown subprocess role: ${args.role}`)
    process.exit(1)
  }

  if (!args.spec || !args.socketPath || !args.dataRoot) {
    console.error('--spec, --data-root, and --socket-path are required for subprocess mode')
    process.exit(1)
  }

  // Deserialize the spec from base64
  const spec: InstallationSpec = JSON.parse(
    Buffer.from(args.spec, 'base64').toString('utf-8')
  )

  // FIXME: Connector registry should be configurable, not hardcoded
  const connectorRegistry = new FsConnectorRegistry({ [spec.connector]: `@max/connector-${spec.connector}` })

  const provider = new BunInProcessInstallationProvider(connectorRegistry, args.dataRoot)
  const handle = await provider.create(spec)

  const dispatcher = new InstallationDispatcher(handle.client)

  createRpcSocketServer({
    socketPath: args.socketPath,
    dispatch: (req) => dispatcher.dispatch(req),
  })

  // Signal readiness to parent process (no ID — parent assigns identity via Supervisor)
  const ready = JSON.stringify({ socketPath: args.socketPath })
  process.stdout.write(ready + '\n')

  // Clean shutdown
  process.on('SIGTERM', async () => {
    await handle.client.stop()
    process.exit(0)
  })
}
