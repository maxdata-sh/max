import { describe, test, expect } from 'bun:test'
import { BunPlatform } from '../bun-platform.js'
import { AcmeConfig, AcmeUser } from '@max/connector-acme'
import { Projection } from '@max/core'
import * as fs from "node:fs";

describe('in-process-provider', () => {
  test('smoke test — ephemeral workspace with in-process installation', async () => {
    const global = BunPlatform.createGlobalMax({
      ephemeral: true
    })
    await global.start()

    const dir = fs.mkdtempSync('/tmp/max-acme')

    // Create workspace via typed deployer kind
    const wsId = await global.createWorkspace('test-workspace', {
      via: BunPlatform.workspace.deploy.inProcess,
      config: {
        strategy: 'in-process',
        dataDir: dir,
      },
      spec: { name: 'test-workspace' },
    })

    const workspace = global.workspace(wsId)
    expect(workspace).toBeDefined()


    // Create installation via typed deployer kind
    const instId = await workspace!.createInstallation({
      via: BunPlatform.installation.deploy.inProcess,
      config: {
        strategy: 'in-process',
        dataDir: dir,
        credentials: { type: 'in-memory', initialSecrets: { api_token: '333' } },
      },
      spec: {
        connector: 'acme',
        name: 'default',
        connectorConfig: { workspaceId: '123', baseUrl: "http://no" } satisfies AcmeConfig,
      },
    })

    // Verify installation is accessible
    const installations = await workspace!.listInstallations()
    expect(installations.length).toBe(1)
    expect(installations[0].connector).toBe('acme')

    // Clean up
    await global.stop()
  })
})
