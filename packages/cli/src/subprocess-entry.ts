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

import { flag } from '@optique/core'
import { object } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { withDefault } from '@optique/core/modifiers'
import { string } from '@optique/core/valueparser'
import {
  createRpcSocketServer,
  FsConnectorRegistry,
  FsProjectManager,
  InProcessInstallationProvider,
  InstallationDispatcher,
} from '@max/federation'
import { createInstallationInProcess } from '@max/platform-bun'
import { InstallationId, Scope } from '@max/core'

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

const SUBPROCESS_PROVIDER_KIND = 'subprocess'

export async function runSubprocess(args: SubprocessArgs): Promise<void> {



  if (args.role !== 'installation') {
    console.error(`Unknown subprocess role: ${args.role}`)
    process.exit(1)
  }

  if (!args.connector || !args.socketPath) {
    console.error('--connector and --socket-path are required for subprocess mode')
    process.exit(1)
  }

  // I think, theoretically, if we're in "installation" mode, we don't have workspace scope -
  // If we were, instead, to be in workspace mode, we'd be supervising installations and maintaining their ids.
  const installationId: InstallationId = '<no id available>'
  const scope = Scope.workspace(installationId)

  const projectManager = new FsProjectManager(args.projectRoot)
  const connectorRegistry = new FsConnectorRegistry({ [args.connector]: `@max/connector-${args.connector}` })

  const installationProvider = new InProcessInstallationProvider((input) => {
    return createInstallationInProcess({
      scope: input.scope,
      value: {
        connectorRegistry,
        projectManager,
        connector: input.value.connector,
        name: input.value.name,
      },
    })
  })

  const runtime = await installationProvider.create({
    scope: scope,
    value: {
      providerKind: SUBPROCESS_PROVIDER_KIND,
      connector: args.connector,
      config: undefined,
      name: args.name
    },
  })


  const dispatcher = new InstallationDispatcher(runtime.client)

  createRpcSocketServer({
    socketPath: args.socketPath,
    dispatch: (req) => dispatcher.dispatch(req),
  })

  // Signal readiness to parent process
  const ready = JSON.stringify({ socketPath: args.socketPath, installationId: runtime.id })
  process.stdout.write(ready + '\n')

  // Clean shutdown
  process.on('SIGTERM', async () => {
    await runtime.client.stop()
    process.exit(0)
  })
}
