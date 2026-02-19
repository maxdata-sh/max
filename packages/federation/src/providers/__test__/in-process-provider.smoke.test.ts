import { describe, test } from 'bun:test'
import {
  InProcessWorkspaceProvider,
} from '../in-process-provider.js'
import { DefaultSupervisor, WorkspaceSupervisor } from '../../federation/index.js'
import { InMemoryInstallationRegistry } from '../../federation/installation-registry.js'
import { FsConnectorRegistry } from '../../connector-registry/fs-connector-registry.js'
import { AcmeUser } from '@max/connector-acme'
import { Projection, type InstallationId, type WorkspaceId } from '@max/core'
import { BunInProcessProvider } from '@max/platform-bun'
import type { HostingType, InstallationNodeProvider } from '@max/federation'
import * as path from 'node:path'

describe('in-process-provider', () => {
  test('smoke test', async () => {
    try {
      const projectRoot = '/Users/ben/projects/playground/max/max/bun-test-project'
      const dataRoot = path.join(projectRoot, '.max', 'installations')
      const connectorRegistry = new FsConnectorRegistry({ acme: '@max/connector-acme' })

      const workspaceSupervisor: WorkspaceSupervisor = new DefaultSupervisor(
        () => crypto.randomUUID() as WorkspaceId
      )

      const installationProvider = new BunInProcessProvider(connectorRegistry, dataRoot)
      const providers = new Map<HostingType, InstallationNodeProvider>([
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
          defaultHostingType: 'in-process',
        },
      })
      const workspace = workspaceSupervisor.register(unlabelledWorkspace)

      const acmeId = await workspace.client.createInstallation({
        spec: { connector: 'acme', name: 'default', connectorConfig:{workspaceId: "123"} },
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
