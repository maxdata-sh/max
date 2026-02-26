/**
 * Filesystem-backed InstallationRegistry.
 *
 * Reads and writes the `installations` section of max.json.
 * Preserves all other sections (connectors, etc.) on write.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { InstallationId, LocatorURI } from '@max/core'
import {
  DeploymentConfig,
  ErrInvariant,
  InstallationRegistry,
  InstallationRegistryEntry,
} from '@max/federation'
import type { MaxJsonFile, MaxJsonInstallation } from '@max/federation'
import { ErrRegistryEntryAlreadyExists, ErrRegistryEntryNotFound } from '@max/federation'

export class FsInstallationRegistry implements InstallationRegistry {
  private readonly baseDir: string

  constructor(private readonly maxJsonPath: string) {
    this.baseDir = path.dirname(maxJsonPath)
  }

  add(entry: InstallationRegistryEntry): void {
    const file = this.read()
    const installations = file.installations ?? {}

    if (installations[entry.name] !== undefined) {
      throw ErrRegistryEntryAlreadyExists.create({ name: entry.name })
    }

    installations[entry.name] = toJsonInstallation(entry, this.baseDir)
    this.write({ ...file, installations })
  }

  remove(id: InstallationId): void {
    const file = this.read()
    const installations = file.installations ?? {}

    const name = findNameById(installations, id)
    if (name === undefined) {
      throw ErrRegistryEntryNotFound.create({ registry: 'installation', id })
    }

    delete installations[name]
    this.write({ ...file, installations })
  }

  get(id: InstallationId): InstallationRegistryEntry | undefined {
    const file = this.read()
    const installations = file.installations ?? {}

    for (const [name, entry] of Object.entries(installations)) {
      if (entry.id === id) {
        return toRegistryEntry(name, entry, this.baseDir)
      }
    }

    return undefined
  }

  list(): InstallationRegistryEntry[] {
    const file = this.read()
    const installations = file.installations ?? {}

    return Object.entries(installations)
      .map(([name, entry]) => toRegistryEntry(name, entry, this.baseDir))
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

function toJsonInstallation(entry: InstallationRegistryEntry, baseDir: string): MaxJsonInstallation {
  return {
    id: entry.id,
    connector: entry.connector,
    connectedAt: entry.connectedAt,
    deployment: relativizeDataDir(entry.deployment, baseDir),
    locator: entry.locator,
    spec: entry.spec,
  }
}

function toRegistryEntry(name: string, json: MaxJsonInstallation, baseDir: string): InstallationRegistryEntry {
  // FIXME: We only have one customer (me!). Let's just fix our max.json files so we can sunset this.
  // Backward compat: old max.json files have `provider` + `location` instead of `hosting`

  if (!('spec' in json) || !('deployment' in json) || !('locator' in json)){
    throw ErrInvariant.create({detail: "max.json is malformed. Expected at least keys [spec,deployment,locator]", args: json}, `${name}`)
  }

  return {
    id: json.id,
    connector: json.connector,
    name,
    connectedAt: json.connectedAt,
    locator: json.locator,
    spec: json.spec,
    deployment: resolveDataDir(json.deployment, baseDir),
  }
}

// --------------------------------------------------------------------------
// Path portability — store relative in max.json, resolve on read
// --------------------------------------------------------------------------

function relativizeDataDir(deployment: DeploymentConfig, baseDir: string): DeploymentConfig {
  const d = deployment as Record<string, unknown>
  if (typeof d.dataDir === 'string' && path.isAbsolute(d.dataDir)) {
    return { ...deployment, dataDir: path.relative(baseDir, d.dataDir) }
  }
  return deployment
}

function resolveDataDir(deployment: DeploymentConfig, baseDir: string): DeploymentConfig {
  const d = deployment as Record<string, unknown>
  if (typeof d.dataDir === 'string' && !path.isAbsolute(d.dataDir)) {
    return { ...deployment, dataDir: path.resolve(baseDir, d.dataDir) }
  }
  return deployment
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
