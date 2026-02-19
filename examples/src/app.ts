/**
 * Shared MaxProjectApp bootstrap for examples.
 *
 * Points at bun-test-project/ which has a .max directory with installations.
 * Usage: import { app } from "./app.js"
 */

import * as path from 'node:path'
import {
  DefaultSupervisor,
  FsConnectorRegistry,
  FsProjectManager,
  InMemoryInstallationRegistry,
  InProcessInstallationProvider,
  InProcessWorkspaceProvider,
  WorkspaceSupervisor,
} from '@max/federation'
import { Projection, type InstallationId, type WorkspaceId } from '@max/core'
import { createInstallationInProcess } from '@max/platform-bun'
import { AcmeUser } from '@max/connector-acme'

const projectRoot = path.resolve(__dirname, '../../bun-test-project')

try {
  const projectManager = new FsProjectManager(projectRoot)
  const connectorRegistry = new FsConnectorRegistry({
    acme: '@max/connector-acme'
  })
  const workspaceSupervisor: WorkspaceSupervisor = new DefaultSupervisor(
    () => crypto.randomUUID() as WorkspaceId
  )
  const installationProvider = new InProcessInstallationProvider((input) => {
    console.log({input})
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

  const workspaceProvider = new InProcessWorkspaceProvider()
  const unlabelledWorkspace = await workspaceProvider.create({
    workspace: {
      registry: new InMemoryInstallationRegistry(),
      installationSupervisor: new DefaultSupervisor(
        () => crypto.randomUUID() as InstallationId
      ),
      installationProvider: installationProvider,
    },
  })
  const workspace = workspaceSupervisor.register(unlabelledWorkspace)

  const acmeId = await workspace.client.createInstallation({
    name: 'default',
    connector: 'acme',
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
