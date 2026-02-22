import { describe, test, expect } from 'bun:test'
import { BunPlatform, installationGraph, workspaceGraph, globalGraph } from '../bun-platform.js'
import { BunConnectorRegistry } from '../services/bun-connector-registry.js'
import { SqliteEngine } from '@max/storage-sqlite'
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from '@max/execution-sqlite'
import { InMemoryCredentialStore } from '@max/connector'
import { InMemoryInstallationRegistry, InMemoryWorkspaceRegistry } from '@max/federation'
import { ISODateString } from '@max/core'
import { FsCredentialStore } from '../services/fs-credential-store.js'
import { FsWorkspaceRegistry } from '../services/fs-workspace-registry.js'
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
})
