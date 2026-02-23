import { describe, test, expect } from "bun:test"
import { MaxUrl } from '@max/core'
import { InMemoryWorkspaceRegistry } from '../federation/workspace-registry.js'
import { InMemoryInstallationRegistry } from '../federation/installation-registry.js'
import { BunPlatform } from "@max/platform-bun"
import { InMemoryCredentialStore } from '@max/connector'
import { SqliteEngine } from '@max/storage-sqlite'
import { SqliteExecutionSchema } from '@max/execution-sqlite'
import { AcmeConfig } from "@max/connector-acme"

// -- Helpers ------------------------------------------------------------------

async function setup() {
  // All-level injection: no filesystem needed
  const global = BunPlatform.createGlobalMax({
    global: { workspaceRegistry: () => new InMemoryWorkspaceRegistry() },
    workspace: { installationRegistry: () => new InMemoryInstallationRegistry() },
    installation: {
      engine: (c) => {
        const engine = SqliteEngine.open(':memory:', c.connector.def.schema)
        SqliteExecutionSchema.ensureTables(engine.db)
        return engine
      },
      credentialStore: () => new InMemoryCredentialStore({}),
    },
  })

  const wid = await global.createWorkspace('my-team', {
    via: BunPlatform.workspace.deploy.inProcess,
    config: {
      strategy: 'in-process',
      dataDir: '/not-used',
    },
    spec: { name: 'my-team' },
  })

  const workspace = global.workspace(wid)
  const instId = await workspace.createInstallation({
    via: BunPlatform.installation.deploy.inProcess,
    config: {
      strategy: 'in-process',
      dataDir: '/not-used',
      connectorRegistry: { type: 'hardcoded', moduleMap: { hp: '@max/connector-acme' } },
    },
    spec: {
      name: 'hubspot-prod',
      connector: 'hp',
      connectorConfig: { workspaceId: 'team', baseUrl: '' } satisfies AcmeConfig,
      initialCredentials: { api_token: "123" },
    },
  })

  return {
    global,
    workspaceId: wid,
    installationId: instId,
    resolver: global.maxUrlResolver(),
  }
}

// -- Tests --------------------------------------------------------------------

describe('MaxUrlResolver', async () => {
  const { resolver, workspaceId, installationId } = await setup()

  test('max://~ → global level, returns GlobalClient', () => {
    const result = resolver.resolve(MaxUrl.parse('max://~'))

    expect(result.level).toBe('global')
    expect(result.global).toBeDefined()
  })

  test('max://~/my-team → workspace level, returns WorkspaceClient + correct ID', () => {
    const result = resolver.resolve(MaxUrl.parse('max://~/my-team'))

    expect(result.level).toBe('workspace')
    if (result.level === 'workspace') {
      expect(result.id).toBe(workspaceId)
      expect(result.global).toBeDefined()
      expect(result.workspace).toBeDefined()
    }
  })

  test('max://~/{workspaceId} → workspace by ID fallback', () => {
    const result = resolver.resolve(MaxUrl.parse(`max://~/${workspaceId}`))

    expect(result.level).toBe('workspace')
    if (result.level === 'workspace') {
      expect(result.id).toBe(workspaceId)
    }
  })

  test('max://~/my-team/hubspot-prod → installation level', () => {
    const result = resolver.resolve(MaxUrl.parse('max://~/my-team/hubspot-prod'))

    expect(result.level).toBe('installation')
    if (result.level === 'installation') {
      expect(result.id).toBe(installationId)
      expect(result.workspaceId).toBe(workspaceId)
      expect(result.global).toBeDefined()
      expect(result.workspace).toBeDefined()
      expect(result.installation).toBeDefined()
    }
  })

  test('max://~/my-team/{installationId} → installation by ID fallback', () => {
    const result = resolver.resolve(MaxUrl.parse(`max://~/my-team/${installationId}`))

    expect(result.level).toBe('installation')
    if (result.level === 'installation') {
      expect(result.id).toBe(installationId)
    }
  })

  test('max://~/nonexistent → throws workspace not resolved', () => {
    expect(() => resolver.resolve(MaxUrl.parse('max://~/nonexistent'))).toThrow('not found')
  })

  test('max://~/my-team/nonexistent → throws installation not resolved', () => {
    expect(() => resolver.resolve(MaxUrl.parse('max://~/my-team/nonexistent'))).toThrow('not found')
  })

  test('max://remote.host/ws → throws remote not supported', () => {
    expect(() => resolver.resolve(MaxUrl.parse('max://remote.host/ws'))).toThrow('not yet supported')
  })
})
