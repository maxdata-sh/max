import { describe, test, expect } from "bun:test"
import {
  MaxUrl,
  MaxError,
  type WorkspaceId,
  type InstallationId,
  ISODateString,
} from '@max/core'
import { GlobalMax } from '../federation/global-max.js'
import { WorkspaceMax } from '../federation/workspace-max.js'
import { DefaultSupervisor } from '../federation/default-supervisor.js'
import { InMemoryWorkspaceRegistry } from '../federation/workspace-registry.js'
import { InMemoryInstallationRegistry } from '../federation/installation-registry.js'
import { DeployerRegistry } from '../deployers/deployer-registry.js'
import { StubbedInstallationClient } from '../testing.js'
import {InMemoryConnectorRegistry} from "@max/connector";
import {BunPlatform} from "@max/platform-bun";
import {AcmeConfig} from "@max/connector-acme";

// -- Helpers ------------------------------------------------------------------

let wsCounter = 0
let instCounter = 0

async function setup() {

  // FIXME: Wiring dependencies in to a Global/Workspace Max is too cumbersome. We need to address resolver injection
  const workspaceRegistry = new InMemoryWorkspaceRegistry()
  const workspaceSupervisor = new DefaultSupervisor<any, WorkspaceId>(() => `ws-team-${++wsCounter}` as WorkspaceId)

  const global = new GlobalMax({
    workspaceSupervisor,
    workspaceRegistry,
    workspaceDeployer: BunPlatform.workspace.registry
  })

  const wid = await global.createWorkspace('my-team', {
    via: BunPlatform.workspace.deploy.inProcess,
    config:{
      strategy: 'in-process',
      dataDir: '/not-used',
      installationRegistry: {type: 'in-memory'}
    },
    spec: { name: 'my-team' }
  })
  const workspace = global.workspace(wid)
  const instId = await workspace.createInstallation({
    via: BunPlatform.installation.deploy.inProcess,
    config: {
      strategy: 'in-process',
      dataDir: '/not-used',
      engine: {type: 'in-memory'},
      credentials: {type: 'in-memory'},
      connectorRegistry: { type: 'hardcoded', moduleMap: { hp: '@max/connector-acme' } },
    },
    spec: {
      name: 'hubspot-prod',
      connector: 'hp',
      connectorConfig: { workspaceId: 'team', baseUrl: '' } satisfies AcmeConfig,
      initialCredentials: { api_token: "123" }
    },
  })

  return {
    global,
    workspaceId: wid,
    installationId: instId,
    resolver: global.maxUrlResolver()
  }
}

// -- Tests --------------------------------------------------------------------

describe('MaxUrlResolver', async () => {
  const { resolver, workspaceId, installationId } = await setup()
  test('max://~ → global level, returns GlobalClient', () => {
    const result = resolver.resolve(MaxUrl.parse('max://~'))

    expect(result.level).toBe('global')
    expect(result.client).toBeDefined()
  })

  test('max://~/my-team → workspace level, returns WorkspaceClient + correct ID', () => {
    const result = resolver.resolve(MaxUrl.parse('max://~/my-team'))

    expect(result.level).toBe('workspace')
    if (result.level === 'workspace') {
      expect(result.id).toBe(workspaceId)
      expect(result.client).toBeDefined()
    }
  })

  test('max://~/ws-team-1 → workspace by ID fallback', () => {
    const result = resolver.resolve(MaxUrl.parse('max://~/ws-team-1'))

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
      expect(result.workspaceId).toBe('ws-team-1')
      expect(result.client).toBeDefined()
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
