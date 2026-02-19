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
import { Projection, type InstallationId, type WorkspaceId } from '@max/core'
import {createInstallationInProcess} from "@max/platform-bun";

describe('in-process-provider', () => {
  test('smoke test', async () => {
    try {
      const projectManager = new FsProjectManager(
        '/Users/ben/projects/playground/max/max/bun-test-project'
      )
      const connectorRegistry = new FsConnectorRegistry({ acme: '@max/connector-acme' })
      const workspaceSupervisor = new DefaultSupervisor<any, WorkspaceId>(
        () => crypto.randomUUID() as WorkspaceId
      )
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
  })
})
