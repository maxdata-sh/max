import { describe, expect, test } from 'bun:test'
import { MaxUrl } from '@max/core'
import { GlobalMax } from '../federation/index.js'
import { DeployerRegistry } from '../deployers/index.js'
import { InlineDeployer } from '../federation/deployer-common/inline-deployer.js'
import type { InstallationClient } from '../protocols/index.js'
import { AcmeSchema } from '@max/connector-acme'

// -- Helpers ------------------------------------------------------------------

async function setup() {
  const stubInstallation: InstallationClient = {
    health: async () => ({ status: 'healthy' as const }),
    start: async () => ({ outcome: 'started' as const }),
    stop: async () => ({ outcome: 'stopped' as const }),
    describe: async () => ({
      connector: '@max/connector-acme',
      name: 'acme',
      schema: AcmeSchema,
    }),
    schema: async () => AcmeSchema,
    engine: {} as InstallationClient['engine'],
    sync: async () => ({ close: async () => {} }) as any,
  }

  const max = GlobalMax.ephemeral({
    installationDeployer: new DeployerRegistry('test', [
      new InlineDeployer(async () => stubInstallation),
    ]),
  })
  await max.start()

  const wsId = await max.createWorkspace('my-team', {
    via: InlineDeployer.deployerKind,
    config: { strategy: 'inline' },
    spec: { name: 'my-team' },
  })
  const workspace = max.workspace(wsId)!
  const instId = await workspace.createInstallation({
    via: InlineDeployer.deployerKind,
    config: { strategy: 'inline' },
    spec: { connector: '@max/connector-acme', name: 'hubspot-prod' },
  })

  return {
    global: max,
    workspaceId: workspace.id,
    installationId: instId,
    resolver: max.maxUrlResolver,
  }
}

// -- Tests --------------------------------------------------------------------

describe('MaxUrlResolver', async () => {
  const { resolver, workspaceId, installationId } = await setup()

  test('max://@ → global level, returns GlobalClient', async () => {
    const result = await resolver.resolve(MaxUrl.parse('max://@'))

    expect(result.level).toBe('global')
    expect(result.global).toBeDefined()
  })

  test('max://@/my-team → workspace level, returns WorkspaceClient + correct ID', async () => {
    const result = await resolver.resolve(MaxUrl.parse('max://@/my-team'))

    expect(result.level).toBe('workspace')
    if (result.level === 'workspace') {
      expect(result.workspace.id).toBe(workspaceId)
      expect(result.global).toBeDefined()
      expect(result.workspace).toBeDefined()
    }
  })

  test('max://@/{workspaceId} → workspace by ID fallback', async () => {
    const result = await resolver.resolve(MaxUrl.parse(`max://@/${workspaceId}`))

    expect(result.level).toBe('workspace')
    if (result.level === 'workspace') {
      expect(result.workspace.id).toBe(workspaceId)
    }
  })

  test('max://@/my-team/hubspot-prod → installation level', async () => {
    const result = await resolver.resolve(MaxUrl.parse('max://@/my-team/hubspot-prod'))

    expect(result.level).toBe('installation')
    if (result.level === 'installation') {
      expect(result.installation.id).toBe(installationId)
      expect(result.workspace.id).toBe(workspaceId)
      expect(result.global).toBeDefined()
      expect(result.workspace).toBeDefined()
      expect(result.installation).toBeDefined()
    }
  })

  test('max://@/my-team/{installationId} → installation by ID fallback', async () => {
    const result = await resolver.resolve(MaxUrl.parse(`max://@/my-team/${installationId}`))

    expect(result.level).toBe('installation')
    if (result.level === 'installation') {
      expect(result.installation.id).toBe(installationId)
    }
  })

  test('max://@/nonexistent → throws workspace not resolved', async () => {
    expect(resolver.resolve(MaxUrl.parse('max://@/nonexistent'))).rejects.toThrow('not found')
  })

  test('max://@/my-team/nonexistent → throws installation not resolved', async () => {
    expect(resolver.resolve(MaxUrl.parse('max://@/my-team/nonexistent'))).rejects.toThrow('not found')
  })

  test('max://remote.host/ws → throws remote not supported', async () => {
    expect(resolver.resolve(MaxUrl.parse('max://remote.host/ws'))).rejects.toThrow(
      'not yet supported'
    )
  })
})
