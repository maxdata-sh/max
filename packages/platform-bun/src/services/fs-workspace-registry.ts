/**
 * FsWorkspaceRegistry — Filesystem-backed WorkspaceRegistry for the Bun platform.
 *
 * Reads and writes `~/.max/workspaces.json`. Implements the WorkspaceRegistry
 * interface so it can be passed directly to GlobalMax.
 *
 * The hosting config on each entry carries the workspace's location:
 *   - subprocess: `{ strategy: "subprocess", workingDir: "~/.max/workspaces/{id}" }`
 *   - in-process: `{ strategy: "in-process", dataDir: "~/.max/workspaces/{id}" }`
 *   - remote:     `{ strategy: "remote", url: "https://..." }`
 *
 * Directory layout under `~/.max/workspaces/{id}/` is the provider's concern.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { WorkspaceId } from '@max/core'
import type { WorkspaceRegistry, WorkspaceRegistryEntry } from '@max/federation'
import { ErrRegistryEntryAlreadyExists, ErrRegistryEntryNotFound } from '@max/federation'
import { initProject } from '../util/init-project.js'

// ============================================================================
// On-disk JSON shape
// ============================================================================

/** Root of workspaces.json. */
interface WorkspacesFile {
  readonly workspaces: WorkspaceRegistryEntry[]
}

// ============================================================================
// FsWorkspaceRegistry
// ============================================================================

export class FsWorkspaceRegistry implements WorkspaceRegistry {
  private entries = new Map<WorkspaceId, WorkspaceRegistryEntry>()
  private readonly configPath: string

  constructor(private readonly maxDir: string) {
    this.configPath = path.join(maxDir, 'workspaces.json')
  }

  // --------------------------------------------------------------------------
  // WorkspaceRegistry — CRUD
  // --------------------------------------------------------------------------

  add(entry: WorkspaceRegistryEntry): void {
    if (this.entries.has(entry.id)) {
      throw ErrRegistryEntryAlreadyExists.create({ name: entry.name })
    }
    this.entries.set(entry.id, entry)
  }

  remove(id: WorkspaceId): void {
    if (!this.entries.delete(id)) {
      throw ErrRegistryEntryNotFound.create({ registry: 'workspace', id })
    }
  }

  get(id: WorkspaceId): WorkspaceRegistryEntry | undefined {
    return this.entries.get(id)
  }

  list(): WorkspaceRegistryEntry[] {
    return [...this.entries.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // --------------------------------------------------------------------------
  // WorkspaceRegistry — persistence
  // --------------------------------------------------------------------------

  async load(): Promise<void> {
    if (!fs.existsSync(this.configPath)) return

    const raw = fs.readFileSync(this.configPath, 'utf-8')
    const file = JSON.parse(raw) as WorkspacesFile
    const workspaces = file.workspaces ?? []

    this.entries.clear()
    for (const entry of workspaces) {
      this.entries.set(entry.id, entry)
    }
  }

  async persist(): Promise<void> {
    const dir = path.dirname(this.configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Scaffold .max/ + max.json for filesystem-backed workspaces
    for (const entry of this.entries.values()) {
      const dataDir = (entry.config as Record<string, unknown>).dataDir
      if (typeof dataDir === 'string') {
        initProject(path.dirname(dataDir))
      }
    }

    const file: WorkspacesFile = {
      workspaces: [...this.entries.values()],
    }
    fs.writeFileSync(this.configPath, JSON.stringify(file, null, 2) + '\n')
  }
}
