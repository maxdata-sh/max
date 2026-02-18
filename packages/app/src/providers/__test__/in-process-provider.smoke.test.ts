import { describe, test } from 'bun:test'
import {
  InProcessInstallationProvider,
  InProcessWorkspaceProvider,
} from '../in-process-provider.js'
import { DefaultSupervisor } from '../../federation/index.js'
import { FsProjectManager } from '../../project-manager/index.js'
import { InMemoryInstallationRegistry } from '../../federation/installation-registry.js'
import { FsConnectorRegistry } from '../../connector-registry/fs-connector-registry.js'
import { AcmeUser } from '@max/connector-acme'
import { Projection } from '@max/core'

describe('in-process-provider', () => {
  test('smoke test', async () => {
    try {
      const workspaceProvider = new InProcessWorkspaceProvider()
      const workspace = await workspaceProvider.create({
        id: 'workspace1',
        workspace: {
          registry: new InMemoryInstallationRegistry(),
          installationSupervisor: new DefaultSupervisor(),
          installationProvider: new InProcessInstallationProvider({
            connectorRegistry: new FsConnectorRegistry({
              acme: '@max/connector-acme',
            }),
            projectManager: new FsProjectManager(
              '/Users/ben/projects/playground/max/max/bun-test-project'
            ),
          }),
        },
      })

      const acme = await workspace.client.createInstallation({
        name: 'default',
        connector: 'acme',
      })

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
  })
})
