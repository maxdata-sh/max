/**
 * Filesystem-backed InstallationRegistry.
 *
 * Reads and writes the `installations` section of max.json.
 * Preserves all other sections (connectors, etc.) on write.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { InstallationId, ProviderKind } from '@max/core'
import type { InstallationRegistry, InstallationRegistryEntry } from './installation-registry.js'
import type { MaxJsonFile, MaxJsonInstallation } from './max-json.js'
import { ErrRegistryEntryAlreadyExists, ErrRegistryEntryNotFound } from './errors.js'

export class FsInstallationRegistry implements InstallationRegistry {
  constructor(private readonly maxJsonPath: string) {}

  add(entry: InstallationRegistryEntry): void {
    const file = this.read()
    const installations = file.installations ?? {}

    if (installations[entry.name] !== undefined) {
      throw ErrRegistryEntryAlreadyExists.create({ name: entry.name })
    }

    installations[entry.name] = toJsonInstallation(entry)
    this.write({ ...file, installations })
  }

  remove(id: InstallationId): void {
    const file = this.read()
    const installations = file.installations ?? {}

    const name = findNameById(installations, id)
    if (name === undefined) {
      throw ErrRegistryEntryNotFound.create({ id })
    }

    delete installations[name]
    this.write({ ...file, installations })
  }

  get(id: InstallationId): InstallationRegistryEntry | undefined {
    const file = this.read()
    const installations = file.installations ?? {}

    for (const [name, entry] of Object.entries(installations)) {
      if (entry.id === id) {
        return toRegistryEntry(name, entry)
      }
    }

    return undefined
  }

  list(): InstallationRegistryEntry[] {
    const file = this.read()
    const installations = file.installations ?? {}

    return Object.entries(installations)
      .map(([name, entry]) => toRegistryEntry(name, entry))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // --------------------------------------------------------------------------
  // File I/O
  // --------------------------------------------------------------------------

  private read(): MaxJsonFile {
    if (!fs.existsSync(this.maxJsonPath)) {
      return {}
    }
    const raw = fs.readFileSync(this.maxJsonPath, 'utf-8')
    return JSON.parse(raw) as MaxJsonFile
  }

  private write(file: MaxJsonFile): void {
    const dir = path.dirname(this.maxJsonPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.maxJsonPath, JSON.stringify(file, null, 2) + '\n')
  }
}

// --------------------------------------------------------------------------
// Mapping helpers
// --------------------------------------------------------------------------

function toJsonInstallation(entry: InstallationRegistryEntry): MaxJsonInstallation {
  const result: MaxJsonInstallation = {
    id: entry.id,
    connector: entry.connector,
    connectedAt: entry.connectedAt,
    provider: entry.providerKind,
    location: entry.location
  }

  return result
}

function toRegistryEntry(name: string, json: MaxJsonInstallation): InstallationRegistryEntry {
  return {
    id: json.id,
    connector: json.connector,
    name,
    connectedAt: json.connectedAt,
    providerKind: (json.provider ?? 'in-process') as ProviderKind,
    location: json.location ?? null,
  }
}

function findNameById(
  installations: Record<string, MaxJsonInstallation>,
  id: InstallationId,
): string | undefined {
  for (const [name, entry] of Object.entries(installations)) {
    if (entry.id === id) return name
  }
  return undefined
}
