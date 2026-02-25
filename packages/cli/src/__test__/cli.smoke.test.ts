import { describe, test, expect } from 'bun:test'
import { BunPlatform, GlobalConfig } from '@max/platform-bun'
import { AcmeConfig } from '@max/connector-acme'
import { CLI } from '../cli.js'

// -- Helpers ------------------------------------------------------------------

/** Fresh ephemeral environment per test — no shared state. */
async function createTestCli() {
  const global = BunPlatform.createGlobalMax({ ephemeral: true })
  await global.start()

  const wsId = await global.createWorkspace('test-project', {
    via: BunPlatform.workspace.deploy.inProcess,
    config: { strategy: 'in-process', dataDir: '/tmp/max-cli-test' },
    spec: { name: 'test-project' },
  })

  const workspace = global.workspace(wsId)
  await workspace.createInstallation({
    via: BunPlatform.installation.deploy.inProcess,
    config: {
      strategy: 'in-process',
      dataDir: '/tmp/max-cli-test/installations/default',
      credentials: { type: 'in-memory', initialSecrets: { api_token: 'test' } },
    },
    spec: {
      connector: 'acme',
      name: 'default',
      connectorConfig: { workspaceId: 'test', baseUrl: '' } satisfies AcmeConfig,
    },
  })

  const cfg = new GlobalConfig({ cwd: '/tmp', mode: 'direct', useColor: false })
  const cli = new CLI(cfg, { globalMax: global })

  return {
    cli,
    run: (target: string, argv: string[]) =>
      cli.execute({ kind: 'run', argv: ['-t', target, ...argv], color: false }),
    complete: (argv: string[]) =>
      cli.execute({ kind: 'complete', argv, color: false }),
  }
}

/** I don't know why, but intellij does not like expect(x).rejects.throw() - even though bun run test is fine.
 *  I don't have time to figure out why, so I'm shimming the expecter in this test
 * */
async function expectError(promise:Promise<any>){
  let result: Error
  try {
    await promise
  }catch (e){
    result = e as Error
  }
  expect(result!).toBeInstanceOf(Error)
}

// -- Tests --------------------------------------------------------------------

describe('CLI smoke', () => {

  test('bogus input', async () => {
    const { run } = await createTestCli()
    const res = await run('max://@', ['bogus'])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('Usage: max')
  })

  describe('schema', () => {
    test('workspace level — schema acme', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project', ['schema', 'acme'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('AcmeUser')
    })

    test('installation level — schema (no source needed)', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project/default', ['schema'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('AcmeUser')
    })
  })

  describe('sync', () => {
    test('workspace level — sync <installation>', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project', ['sync', 'default'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('Sync')
      expect(res.stdout).toContain('Tasks completed')
    })

    test('installation level — sync (no args)', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project/default', ['sync'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('Sync')
    })
  })

  describe('level gating', () => {
    test('sync at global level → throws', async () => {
      const { run } = await createTestCli()
      const result = await run('max://@', ['sync'])
      expect(result.exitCode).toBe(1)
    })

    test('connect at global level → throws', async () => {
      const { run } = await createTestCli()
      const result = await run('max://@', ['connect', 'acme'])
      expect(result.exitCode).toBe(1)
    })
  })

  describe('target resolution', () => {
    test('nonexistent workspace → error response', async () => {
      const { run } = await createTestCli()
      const result = await run('max://@/nonexistent', ['schema', 'acme'])
      expect(result.exitCode).toBe(1)
    })

    test('nonexistent installation → error response', async () => {
      const { run } = await createTestCli()
      const result = await run('max://@/test-project/nonexistent', ['schema'])
      expect(result.exitCode).toBe(1)
    })
  })

  describe('ls', () => {
    test('global level — lists workspaces', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@', ['ls'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('test-project')
      expect(res.stdout).toContain('max://@/test-project')
    })

    test('workspace level — lists installations', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project', ['ls'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('default')
      expect(res.stdout).toContain('max://@/test-project/default')
    })

    test('installation level → not available', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project/default', ['ls'])
      expect(res.exitCode).toBe(1)
    })
  })

  describe('status', () => {
    test('global level', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@', ['status'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('Global:')
      expect(res.stdout).toContain('max://@')
      expect(res.stdout).toContain('Status:')
    })

    test('workspace level', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project', ['status'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('test-project')
      expect(res.stdout).toContain('Status:')
      expect(res.stdout).toContain('default')
    })

    test('installation level', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project/default', ['status'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('default')
      expect(res.stdout).toContain('Connector:')
      expect(res.stdout).toContain('acme')
    })

    test('bare invocation defaults to status', async () => {
      const { cli } = await createTestCli()
      const res = await cli.execute({
        kind: 'run',
        argv: ['-t', 'max://@/test-project'],
        color: false,
      })

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('test-project')
      expect(res.stdout).toContain('Status:')
    })
  })

  describe('tab completion', () => {
    test('bare <TAB> suggests commands (global context)', async () => {
      const { complete } = await createTestCli()
      const res = await complete([''])

      expect(res.exitCode).toBe(0)
      expect(res.completions).toBeDefined()
      expect(res.completions!.length).toBeGreaterThan(0)
      // Should include global-level commands
      expect(res.completions).toContain('status')
      expect(res.completions).toContain('ls')
    })

    test('-t <TAB> suggests workspaces and global', async () => {
      const { complete } = await createTestCli()
      const res = await complete(['-t', ''])

      expect(res.completions).toContain('@')
      expect(res.completions).toContain('test-project')
    })

    test('-t max://@/ suggests workspace URLs', async () => {
      const { complete } = await createTestCli()
      const res = await complete(['-t', 'max://@/'])

      expect(res.completions).toContain('@')
      expect(res.completions).toContain('max://@/test-project')
    })

    test('-t max://@/test-project/ suggests installation URLs', async () => {
      const { complete } = await createTestCli()
      const res = await complete(['-t', 'max://@/test-project/'])

      expect(res.completions).toContain('max://@/test-project/default')
    })

    test('command completion still works after -t', async () => {
      const { complete } = await createTestCli()
      const res = await complete(['-t', 'max://@/test-project', ''])

      // Should suggest command names, not target values
      expect(res.completions).toBeDefined()
      expect(res.completions!.length).toBeGreaterThan(0)
    })
  })

  describe('daemon', () => {
    test('list at global level', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@', ['daemon', 'list'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('test-project')
    })

    test('list at workspace level (uses ctx.global)', async () => {
      const { run } = await createTestCli()
      const res = await run('max://@/test-project', ['daemon', 'list'])

      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('test-project')
    })
  })
})
