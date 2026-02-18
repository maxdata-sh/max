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
} from '@max/federation'
import { Projection } from '@max/core'
import { createInstallationInProcess } from '@max/platform-bun'
import { AcmeUser } from '@max/connector-acme'

const projectRoot = path.resolve(__dirname, '../../bun-test-project')

try {
  const projectManager = new FsProjectManager(projectRoot)
  const connectorRegistry = new FsConnectorRegistry({
    acme: '@max/connector-acme'
  })
  const workspaceProvider = new InProcessWorkspaceProvider()
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

  const workspace = await workspaceProvider.create({
    id: 'workspace1',
    workspace: {
      registry: new InMemoryInstallationRegistry(),
      installationSupervisor: new DefaultSupervisor(),
      installationProvider: installationProvider,
    },
  })

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
