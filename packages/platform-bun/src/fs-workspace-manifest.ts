/**
 * FsWorkspaceManifest — Bun platform's on-disk index of known workspaces.
 *
 * Manages `~/.max/workspaces.json` (quick index) and `~/.max/workspaces/{id}/`
 * (per-workspace daemon directory for pid, socket, log files).
 *
 * This is a Bun platform concern, richer than the federation's WorkspaceRegistry.
 * Each manifest entry carries `projectRoot` and optional `hosting` — local
 * workspaces omit hosting (bun/subprocess is implied), remote ones include it.
 *
 * A WorkspaceRegistryEntry can be derived from a manifest entry when the
 * federation layer needs one.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ISODateString, WorkspaceId } from '@max/core'
import type { SerialisedWorkspaceHosting, PlatformName, WorkspaceRegistryEntry } from '@max/federation'
import { ErrRegistryEntryAlreadyExists, ErrRegistryEntryNotFound } from '@max/federation'

// ============================================================================
// Manifest entry
// ============================================================================

export interface WorkspaceManifestEntry {
  /** Parent-assigned UUID, stable across restarts. */
  readonly id: WorkspaceId
  /** Human-readable workspace name (e.g. project directory name). */
  readonly name: string
  /** Absolute path to the project root on this machine. */
  readonly projectRoot: string
  /** When this workspace was first registered (ISO 8601). */
  readonly connectedAt: ISODateString
  /** Hosting metadata. Absent = local (bun/subprocess implied). */
  readonly hosting?: SerialisedWorkspaceHosting
}

// ============================================================================
// On-disk JSON shape
// ============================================================================

/** Root of workspaces.json — keyed by WorkspaceId. */
type ManifestFile = Record<string, ManifestJsonEntry>

/** A single entry as stored on disk (id comes from the object key). */
interface ManifestJsonEntry {
  readonly name: string
  readonly projectRoot: string
  readonly connectedAt: ISODateString
  readonly hosting?: SerialisedWorkspaceHosting
}

// ============================================================================
// FsWorkspaceManifest
// ============================================================================

const DEFAULT_LOCAL_HOSTING: SerialisedWorkspaceHosting = {
  platform: 'bun' as PlatformName,
  workspace: { strategy: 'subprocess' },
}

export class FsWorkspaceManifest {
  private readonly manifestPath: string
  private readonly workspacesDir: string

  constructor(maxHomeDirectory: string) {
    this.manifestPath = path.join(maxHomeDirectory, 'workspaces.json')
    this.workspacesDir = path.join(maxHomeDirectory, 'workspaces')
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  register(entry: WorkspaceManifestEntry): void {
    const file = this.read()

    if (file[entry.id] !== undefined) {
      throw ErrRegistryEntryAlreadyExists.create({ name: entry.name })
    }

    file[entry.id] = toJsonEntry(entry)
    this.write(file)
  }

  unregister(id: WorkspaceId): void {
    const file = this.read()

    if (file[id] === undefined) {
      throw ErrRegistryEntryNotFound.create({ registry: 'workspace', id })
    }

    delete file[id]
    this.write(file)
  }

  get(id: WorkspaceId): WorkspaceManifestEntry | undefined {
    const file = this.read()
    const json = file[id]
    if (!json) return undefined
    return fromJsonEntry(id, json)
  }

  /** Find a workspace by its project root path. */
  find(opts: { projectRoot: string }): WorkspaceManifestEntry | undefined {
    const file = this.read()
    for (const [id, json] of Object.entries(file)) {
      if (json.projectRoot === opts.projectRoot) {
        return fromJsonEntry(id, json)
      }
    }
    return undefined
  }

  list(): WorkspaceManifestEntry[] {
    const file = this.read()
    return Object.entries(file)
      .map(([id, json]) => fromJsonEntry(id, json))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // --------------------------------------------------------------------------
  // Daemon paths
  // --------------------------------------------------------------------------

  daemonDir(id: WorkspaceId): string {
    return path.join(this.workspacesDir, id)
  }

  socketPath(id: WorkspaceId): string {
    return path.join(this.workspacesDir, id, 'daemon.sock')
  }

  pidPath(id: WorkspaceId): string {
    return path.join(this.workspacesDir, id, 'daemon.pid')
  }

  logPath(id: WorkspaceId): string {
    return path.join(this.workspacesDir, id, 'daemon.log')
  }

  // --------------------------------------------------------------------------
  // Registry derivation
  // --------------------------------------------------------------------------

  /** Derive a WorkspaceRegistryEntry from a manifest entry. */
  static toRegistryEntry(entry: WorkspaceManifestEntry): WorkspaceRegistryEntry {
    return {
      id: entry.id,
      name: entry.name,
      connectedAt: entry.connectedAt,
      hosting: entry.hosting ?? DEFAULT_LOCAL_HOSTING,
    }
  }

  // --------------------------------------------------------------------------
  // File I/O
  // --------------------------------------------------------------------------

  private read(): ManifestFile {
    if (!fs.existsSync(this.manifestPath)) {
      return {}
    }
    const raw = fs.readFileSync(this.manifestPath, 'utf-8')
    return JSON.parse(raw) as ManifestFile
  }

  private write(file: ManifestFile): void {
    const dir = path.dirname(this.manifestPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.manifestPath, JSON.stringify(file, null, 2) + '\n')
  }
}

// --------------------------------------------------------------------------
// Mapping helpers
// --------------------------------------------------------------------------

function toJsonEntry(entry: WorkspaceManifestEntry): ManifestJsonEntry {
  const json: ManifestJsonEntry = {
    name: entry.name,
    projectRoot: entry.projectRoot,
    connectedAt: entry.connectedAt,
  }
  if (entry.hosting) {
    return { ...json, hosting: entry.hosting }
  }
  return json
}

function fromJsonEntry(id: WorkspaceId, json: ManifestJsonEntry): WorkspaceManifestEntry {
  return {
    id,
    name: json.name,
    projectRoot: json.projectRoot,
    connectedAt: json.connectedAt,
    hosting: json.hosting,
  }
}
