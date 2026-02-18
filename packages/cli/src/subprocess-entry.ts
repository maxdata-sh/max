/**
 * Subprocess entry point — runs an installation node in a child process.
 *
 * Invoked with: max --subprocess --role=installation --connector=acme
 *               --project-root=/path --socket-path=/tmp/max-inst-xxx.sock
 *
 * Creates an InstallationRuntimeImpl, wraps it in an InstallationDispatcher,
 * starts an RPC socket server, and writes a ready signal to stdout so the
 * parent process can connect.
 */

import { parseSync } from '@optique/core'
import { flag, passThrough } from '@optique/core'
import { object } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { withDefault } from '@optique/core/modifiers'
import { string } from '@optique/core/valueparser'
import {
  FsProjectManager,
  FsConnectorRegistry,
  InstallationRuntimeImpl,
  InstallationDispatcher,
  createRpcSocketServer,
} from '@max/federation'

export const subprocessParsers = object({
  subprocess: flag('--subprocess'),
  role: withDefault(option('--role', string()), 'installation'),
  connector: withDefault(option('--connector', string()), ''),
  name: withDefault(option('--name', string()), ''),
  projectRoot: withDefault(option('--project-root', string()), () => process.cwd()),
  socketPath: withDefault(option('--socket-path', string()), ''),
})

export interface SubprocessArgs {
  role: string
  connector: string
  name: string
  projectRoot: string
  socketPath: string
}

export async function runSubprocess(args: SubprocessArgs): Promise<void> {
  const { role, connector, projectRoot, socketPath, name } = args

  if (role !== 'installation') {
    console.error(`Unknown subprocess role: ${role}`)
    process.exit(1)
  }

  if (!connector || !socketPath) {
    console.error('--connector and --socket-path are required for subprocess mode')
    process.exit(1)
  }

  const projectManager = new FsProjectManager(projectRoot)
  const connectorRegistry = new FsConnectorRegistry({ [connector]: `@max/connector-${connector}` })

  const runtime = await InstallationRuntimeImpl.deprecated_create_connect({
    projectManager,
    connectorRegistry,
    connector,
    name: name || undefined,
  })

  const dispatcher = new InstallationDispatcher(runtime)

  createRpcSocketServer({
    socketPath,
    dispatch: (req) => dispatcher.dispatch(req),
  })

  // Signal readiness to parent process
  const ready = JSON.stringify({ socketPath, installationId: runtime.info.id })
  process.stdout.write(ready + '\n')

  // Clean shutdown
  process.on('SIGTERM', async () => {
    await runtime.lifecycle.stop()
    process.exit(0)
  })
}
