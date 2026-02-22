import { describe, test, expect } from 'bun:test'
import { BunPlatform, installationGraph, workspaceGraph, globalGraph } from '../bun-platform.js'
import { BunConnectorRegistry } from '../services/bun-connector-registry.js'
import { SqliteEngine } from '@max/storage-sqlite'
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from '@max/execution-sqlite'
import { InMemoryCredentialStore } from '@max/connector'
import { InMemoryInstallationRegistry, InMemoryWorkspaceRegistry } from '@max/federation'
import { ISODateString } from '@max/core'
import { FsCredentialStore } from '../services/fs-credential-store.js'
import { FsInstallationRegistry } from '../services/fs-installation-registry.js'
import { FsWorkspaceRegistry } from '../services/fs-workspace-registry.js'
import { InMemorySyncMeta, InMemoryTaskStore } from '@max/execution-local'
import { AcmeConfig } from '@max/connector-acme'
import * as fs from 'node:fs'

const connectorRegistry = new BunConnectorRegistry({ acme: '@max/connector-acme' })

describe('resolver graph injection', () => {

  // ---------------------------------------------------------------------------
  // Installation graph
  // ---------------------------------------------------------------------------

  test('installation — defaults produce sqlite-backed services', async () => {
    const connector = await connectorRegistry.resolve('acme')
    const dir = fs.mkdtempSync('/tmp/max-graph-')

    const deps = installationGraph.resolve({ dataDir: dir, connector })

    expect(deps.engine).toBeInstanceOf(SqliteEngine)
    expect(deps.credentialStore).toBeInstanceOf(FsCredentialStore)
    expect(deps.taskStore).toBeInstanceOf(SqliteTaskStore)
    expect(deps.syncMeta).toBeInstanceOf(SqliteSyncMeta)
  })

  test('installation — engine override cascades to taskStore and syncMeta', async () => {
    const connector = await connectorRegistry.resolve('acme')
    const memoryEngine = SqliteEngine.open(':memory:', connector.def.schema)
    SqliteExecutionSchema.ensureTables(memoryEngine.db)

    const ephemeral = installationGraph.with({
      engine: () => memoryEngine,
    })

    const deps = ephemeral.resolve({ dataDir: '/unused', connector })

    // Exact injected instance
    expect(deps.engine).toBe(memoryEngine)
    // Downstream deps cascaded through the :memory: engine — no separate DB opened
    expect(deps.taskStore).toBeInstanceOf(SqliteTaskStore)
    expect(deps.syncMeta).toBeInstanceOf(SqliteSyncMeta)
  })

  test('installation — inject pre-built credential store, provider cascades', async () => {
    const connector = await connectorRegistry.resolve('acme')
    const dir = fs.mkdtempSync('/tmp/max-graph-')
    const injected = new InMemoryCredentialStore({ token: 'test-123' })

    const graph = installationGraph.with({
      credentialStore: () => injected,
    })

    const deps = graph.resolve({ dataDir: dir, connector })

    expect(deps.credentialStore).toBe(injected)
    // credentialProvider cascades — built from the injected store
    expect(deps.credentialProvider).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // Workspace graph
  // ---------------------------------------------------------------------------

  test('workspace — inject installation registry', () => {
    const injected = new InMemoryInstallationRegistry()

    const graph = workspaceGraph.with({
      installationRegistry: () => injected,
    })

    const deps = graph.resolve({ dataDir: '/unused' })

    expect(deps.installationRegistry).toBe(injected)
    // Other nodes unaffected
    expect(deps.connectorRegistry).toBeDefined()
    expect(deps.supervisor).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // Global graph
  // ---------------------------------------------------------------------------

  test('global — default resolution', () => {
    const deps = globalGraph.resolve({})

    expect(deps.root).toContain('.max')
    expect(deps.workspaceRegistry).toBeInstanceOf(FsWorkspaceRegistry)
    expect(deps.supervisor).toBeDefined()
  })

  test('global — root override cascades to workspaceRegistry', () => {
    const graph = globalGraph.with({
      root: () => '/tmp/custom-max-root',
    })

    const deps = graph.resolve({})

    expect(deps.root).toBe('/tmp/custom-max-root')
    // workspaceRegistry cascades from the overridden root
    expect(deps.workspaceRegistry).toBeInstanceOf(FsWorkspaceRegistry)
  })

  // ---------------------------------------------------------------------------
  // createGlobalMax with overrides
  // ---------------------------------------------------------------------------

  test('createGlobalMax — zero-arg still works', () => {
    const max = BunPlatform.createGlobalMax()
    expect(max).toBeDefined()
  })

  test('createGlobalMax — injected workspace registry is wired through', async () => {
    const injected = new InMemoryWorkspaceRegistry()
    injected.add({
      id: 'test-ws-id',
      name: 'injected-workspace',
      connectedAt: ISODateString.now(),
      config: { strategy: 'in-process' },
      spec: { name: 'injected-workspace' },
    })

    const max = BunPlatform.createGlobalMax({
      global: { workspaceRegistry: () => injected },
    })

    // listWorkspaces reads from the workspace registry —
    // if injection worked, we see our seeded entry
    const workspaces = await max.listWorkspaces()
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0].name).toBe('injected-workspace')
  })

  // ---------------------------------------------------------------------------
  // Ephemeral mode
  // ---------------------------------------------------------------------------

  test('installation — ephemeral: true produces in-memory services', async () => {
    const connector = await connectorRegistry.resolve('acme')

    const deps = installationGraph.resolve({
      dataDir: '/unused',
      connector,
      ephemeral: true,
    })

    expect(deps.credentialStore).toBeInstanceOf(InMemoryCredentialStore)
    expect(deps.taskStore).toBeInstanceOf(InMemoryTaskStore)
    expect(deps.syncMeta).toBeInstanceOf(InMemorySyncMeta)
    // Engine is still SqliteEngine — but backed by :memory:
    expect(deps.engine).toBeInstanceOf(SqliteEngine)
    expect(deps.engineConfig.path).toBe(':memory:')
  })

  test('installation — ephemeral config nodes are independently overrideable', async () => {
    const connector = await connectorRegistry.resolve('acme')
    const dir = fs.mkdtempSync('/tmp/max-graph-')

    // Ephemeral, but force credential store to fs
    const deps = installationGraph.resolve({
      dataDir: dir,
      connector,
      ephemeral: true,
      credentials: { type: 'fs' },
    })

    // Explicit config wins over ephemeral default
    expect(deps.credentialStore).toBeInstanceOf(FsCredentialStore)
    // Everything else still in-memory
    expect(deps.taskStore).toBeInstanceOf(InMemoryTaskStore)
    expect(deps.syncMeta).toBeInstanceOf(InMemorySyncMeta)
  })

  test('workspace — ephemeral: true produces in-memory installation registry', () => {
    const deps = workspaceGraph.resolve({
      dataDir: '/unused',
      ephemeral: true,
    })

    expect(deps.installationRegistry).toBeInstanceOf(InMemoryInstallationRegistry)
  })

  test('workspace — without ephemeral produces fs-backed installation registry', () => {
    const dir = fs.mkdtempSync('/tmp/max-graph-')
    const deps = workspaceGraph.resolve({ dataDir: dir })

    expect(deps.installationRegistry).toBeInstanceOf(FsInstallationRegistry)
  })

  test('global — ephemeral: true produces in-memory workspace registry', () => {
    const deps = globalGraph.resolve({ ephemeral: true })

    expect(deps.workspaceRegistry).toBeInstanceOf(InMemoryWorkspaceRegistry)
  })

  test('createGlobalMax — ephemeral: true wires through all levels', async () => {
    const max = BunPlatform.createGlobalMax({ ephemeral: true })
    await max.start()

    // Create workspace + installation — everything should work without touching the filesystem
    const wsId = await max.createWorkspace('test-ws', {
      via: BunPlatform.workspace.deploy.inProcess,
      config: { strategy: 'in-process', dataDir: '/not-used' },
      spec: { name: 'test-ws' },
    })

    const ws = max.workspace(wsId)
    const instId = await ws.createInstallation({
      via: BunPlatform.installation.deploy.inProcess,
      config: { strategy: 'in-process', dataDir: '/not-used' },
      spec: {
        connector: 'acme',
        name: 'test-inst',
        connectorConfig: { workspaceId: '1', baseUrl: '' } satisfies AcmeConfig,
        initialCredentials: { api_token: 'test' },
      },
    })

    const installations = await ws.listInstallations()
    expect(installations).toHaveLength(1)
    expect(installations[0].connector).toBe('acme')

    await max.stop()
  })
})
