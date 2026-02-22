import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ConnectorVersionIdentifier, InstallationId, ISODateString } from '@max/core'
import { FsInstallationRegistry } from '@max/platform-bun'
import { InMemoryInstallationRegistry } from '../installation-registry.js'
import type { InstallationRegistryEntry } from '../installation-registry.js'
import { ErrRegistryEntryNotFound, ErrRegistryEntryAlreadyExists } from '../errors.js'

let tmpDir: string
let maxJsonPath: string

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'max-registry-test-'))
}

function entry(overrides: Partial<InstallationRegistryEntry> = {}): InstallationRegistryEntry {
  return {
    id: crypto.randomUUID() as InstallationId,
    connector: '@max/connector-acme@1.0.0' as ConnectorVersionIdentifier,
    name: 'acme-default',
    connectedAt: '2026-02-18T12:00:00.000Z' as ISODateString,
    ...overrides,
    deployment: overrides.deployment ?? { strategy: 'strategy-1' },
    spec: overrides.spec ?? { connector: "@max/connector-something" },
    locator: overrides.locator ?? 'locator-1'
  }
}

beforeEach(() => {
  tmpDir = createTmpDir()
  maxJsonPath = path.join(tmpDir, 'max.json')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ============================================================================
// FsInstallationRegistry
// ============================================================================

describe('FsInstallationRegistry', () => {
  test('add + get: stores and retrieves by ID', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    const e = entry({ name: 'linear' })
    registry.add(e)

    const result = registry.get(e.id)
    expect(result).toBeDefined()
    expect(result!.id).toBe(e.id)
    expect(result!.connector).toBe(e.connector)
    expect(result!.name).toBe('linear')
    expect(result!.connectedAt).toBe(e.connectedAt)
    expect(result!.deployment.strategy).toBe('strategy-1')
  })

  test('add + list: returns entries sorted by name', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    registry.add(entry({ name: 'zebra' }))
    registry.add(entry({ name: 'alpha' }))
    registry.add(entry({ name: 'middle' }))

    const items = registry.list()
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.name)).toEqual(['alpha', 'middle', 'zebra'])
  })

  test('add duplicate name: throws ErrRegistryEntryAlreadyExists', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    registry.add(entry({ name: 'linear' }))

    expect(() => registry.add(entry({ name: 'linear' }))).toThrow()
    try {
      registry.add(entry({ name: 'linear' }))
    } catch (err) {
      expect(ErrRegistryEntryAlreadyExists.is(err)).toBe(true)
    }
  })

  test('remove: deletes entry by ID', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    const e = entry({ name: 'linear' })
    registry.add(e)
    expect(registry.get(e.id)).toBeDefined()

    registry.remove(e.id)
    expect(registry.get(e.id)).toBeUndefined()
    expect(registry.list()).toHaveLength(0)
  })

  test('remove nonexistent: throws ErrRegistryEntryNotFound', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)

    expect(() => registry.remove('nonexistent' as InstallationId)).toThrow()
    try {
      registry.remove('nonexistent' as InstallationId)
    } catch (err) {
      expect(ErrRegistryEntryNotFound.is(err)).toBe(true)
    }
  })

  test('get nonexistent: returns undefined', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    expect(registry.get('nonexistent' as InstallationId)).toBeUndefined()
  })

  test('preserves other max.json sections', () => {
    fs.writeFileSync(
      maxJsonPath,
      JSON.stringify({
        connectors: { '@acme/crm': 'git+https://github.com/acme/crm.git' },
        someOtherField: true,
      })
    )

    const registry = new FsInstallationRegistry(maxJsonPath)
    registry.add(entry({ name: 'linear' }))

    const raw = JSON.parse(fs.readFileSync(maxJsonPath, 'utf-8'))
    expect(raw.connectors).toEqual({ '@acme/crm': 'git+https://github.com/acme/crm.git' })
    expect(raw.someOtherField).toBe(true)
    expect(raw.installations).toBeDefined()
    expect(raw.installations.linear).toBeDefined()
  })

  test('creates max.json if missing', () => {
    expect(fs.existsSync(maxJsonPath)).toBe(false)

    const registry = new FsInstallationRegistry(maxJsonPath)
    registry.add(entry({ name: 'linear' }))

    expect(fs.existsSync(maxJsonPath)).toBe(true)
    const raw = JSON.parse(fs.readFileSync(maxJsonPath, 'utf-8'))
    expect(raw.installations.linear).toBeDefined()
  })

  test('list on empty/missing file returns empty array', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    expect(registry.list()).toEqual([])
  })

  test('rejects legacy max.json entries missing required keys', () => {
    // Write a max.json with old format (no spec/deployment/locator)
    fs.writeFileSync(
      maxJsonPath,
      JSON.stringify({
        installations: {
          linear: {
            id: 'test-id-123',
            connector: '@max/connector-linear@1.0.0',
            connectedAt: '2026-02-18T12:00:00.000Z',
          },
        },
      })
    )

    const registry = new FsInstallationRegistry(maxJsonPath)
    expect(() => registry.get('test-id-123' as InstallationId)).toThrow()
  })

  test('stores and retrieves remote installation', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)

    registry.add(
      entry({
        name: 'linear-staging',
        deployment: { strategy: 'remote', url: 'https://staging.acme.com/max/linear' },
      })
    )

    const result = registry.list()
    expect(result).toHaveLength(1)
    expect(result[0].deployment.strategy).toBe('remote')
    expect(result[0].deployment.url).toBe('https://staging.acme.com/max/linear')
  })

  test('writes deployment to disk', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    registry.add(entry({ name: 'linear' }))

    const raw = JSON.parse(fs.readFileSync(maxJsonPath, 'utf-8'))
    const diskEntry = raw.installations.linear
    expect(diskEntry.deployment).toEqual({ strategy: 'strategy-1' })
    expect(diskEntry.spec).toEqual({ connector: '@max/connector-something' })
    expect(diskEntry.locator).toBe('locator-1')
  })
})

// ============================================================================
// InMemoryInstallationRegistry
// ============================================================================

describe('InMemoryInstallationRegistry', () => {
  test('remove nonexistent: throws ErrRegistryEntryNotFound', () => {
    const registry = new InMemoryInstallationRegistry()

    expect(() => registry.remove('nonexistent' as InstallationId)).toThrow()
    try {
      registry.remove('nonexistent' as InstallationId)
    } catch (err) {
      expect(ErrRegistryEntryNotFound.is(err)).toBe(true)
    }
  })
})
