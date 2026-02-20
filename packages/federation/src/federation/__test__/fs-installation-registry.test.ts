import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ConnectorType, InstallationId, ISODateString } from '@max/core'
import type { SerialisedInstallationHosting, PlatformName } from '@max/federation'
import { FsInstallationRegistry } from '@max/platform-bun'
import { InMemoryInstallationRegistry } from '../installation-registry.js'
import type { InstallationRegistryEntry } from '../installation-registry.js'
import { ErrRegistryEntryNotFound, ErrRegistryEntryAlreadyExists } from '../errors.js'

let tmpDir: string
let maxJsonPath: string

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'max-registry-test-'))
}

const BUN_IN_PROCESS_HOSTING: SerialisedInstallationHosting = {
  platform: 'bun' as PlatformName,
  installation: { strategy: 'in-process' },
}

function entry(overrides: Partial<InstallationRegistryEntry> = {}): InstallationRegistryEntry {
  return {
    id: crypto.randomUUID() as InstallationId,
    connector: '@max/connector-acme@1.0.0' as ConnectorType,
    name: 'acme-default',
    connectedAt: '2026-02-18T12:00:00.000Z' as ISODateString,
    hosting: BUN_IN_PROCESS_HOSTING,
    ...overrides,
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
    expect(result!.hosting.installation.strategy).toBe('in-process')
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

  test('backward compat: legacy provider field defaults to bun/in-process hosting', () => {
    // Write a max.json with old provider format (no hosting field)
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
    const result = registry.get('test-id-123' as InstallationId)
    expect(result).toBeDefined()
    expect(result!.hosting.platform).toBe('bun')
    expect(result!.hosting.installation.strategy).toBe('in-process')
  })

  test('stores and retrieves remote installation', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    const remoteHosting: SerialisedInstallationHosting = {
      platform: 'remote' as PlatformName,
      installation: { strategy: 'remote', url: 'https://staging.acme.com/max/linear' },
    }
    registry.add(entry({ name: 'linear-staging', hosting: remoteHosting }))

    const result = registry.list()
    expect(result).toHaveLength(1)
    expect(result[0].hosting.platform).toBe('remote')
    expect(result[0].hosting.installation.strategy).toBe('remote')
    expect(result[0].hosting.installation.url).toBe('https://staging.acme.com/max/linear')
  })

  test('writes hosting to disk', () => {
    const registry = new FsInstallationRegistry(maxJsonPath)
    registry.add(entry({ name: 'linear' }))

    const raw = JSON.parse(fs.readFileSync(maxJsonPath, 'utf-8'))
    const diskEntry = raw.installations.linear
    expect(diskEntry.hosting).toEqual({
      platform: 'bun',
      installation: { strategy: 'in-process' },
    })
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
