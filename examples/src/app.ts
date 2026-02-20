/**
 * Shared MaxProjectApp bootstrap for examples.
 *
 * Points at bun-test-project/ which has a .max directory with installations.
 * Usage: import { app } from "./app.js"
 */

import * as path from 'node:path'
import {
  DefaultSupervisor,
  type HostingStrategy,
  InMemoryInstallationRegistry,
  InProcessWorkspaceProvider,
  type InstallationNodeProvider,
  WorkspaceSupervisor,
} from '@max/federation'
import { type InstallationId, Projection, type WorkspaceId } from '@max/core'
import { BunConnectorRegistry, BunInProcessInstallationProvider } from '@max/platform-bun'
import { AcmeUser } from '@max/connector-acme'

const projectRoot = path.resolve(__dirname, '../../bun-test-project')
const dataRoot = path.join(projectRoot, '.max', 'installations')

try {
  const connectorRegistry = new BunConnectorRegistry({
    acme: '@max/connector-acme'
  })

  const workspaceSupervisor: WorkspaceSupervisor = new DefaultSupervisor(
    () => crypto.randomUUID() as WorkspaceId
  )

  const installationProvider = new BunInProcessInstallationProvider(connectorRegistry, dataRoot)

  const providers = new Map<HostingStrategy, InstallationNodeProvider>([
    ['in-process', installationProvider],
  ])

  const workspaceProvider = new InProcessWorkspaceProvider()
  const unlabelledWorkspace = await workspaceProvider.create({
    workspace: {
      registry: new InMemoryInstallationRegistry(),
      installationSupervisor: new DefaultSupervisor(
        () => crypto.randomUUID() as InstallationId
      ),
      providers,
      defaultHostingStrategy: 'in-process',
      platformName: 'bun',
      connectorRegistry,
    },
  })
  const workspace = workspaceSupervisor.register(unlabelledWorkspace)

  const acmeId = await workspace.client.createInstallation({
    spec: { connector: 'acme', name: 'default' },
  })
  const acme = await workspace.client.installation(acmeId)!

  console.log({
    installations: await workspace.client.listInstallations(),
    data: await workspace.client.health(),
    acme: await acme.engine.load(
      AcmeUser.ref('usr_14cc9f9adc384561b79f93b738e44649'),
      Projection.all
    ),
  })
} catch (e) {
  console.error(e)
}
