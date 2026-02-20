/**
 * GlobalClient — Entry point. Manages workspaces.
 *
 * The top of the federation hierarchy. Knows about all workspaces available
 * to this host or application.
 *
 * Extends Supervised — the global level itself has a lifecycle (though in
 * practice, the CLI or cloud control plane manages it directly).
 */

import { ISODateString, Supervised, WorkspaceId } from '@max/core'
import type { SerialisedWorkspaceHosting } from '../config/hosting-config.js'
import {  WorkspaceClient } from './workspace-client.js'

export interface WorkspaceInfo {
  readonly id: WorkspaceId
  readonly name: string
  readonly connectedAt: ISODateString
  readonly hosting: SerialisedWorkspaceHosting
}

export interface GlobalClient extends Supervised {
  listWorkspaces(): Promise<WorkspaceInfo[]>

  /** Synchronous lookup of a single workspace by its parent-assigned ID. */
  workspace(id: WorkspaceId): WorkspaceClient | undefined

  /** Create a new workspace from serializable config. */
  createWorkspace(config: CreateWorkspaceConfig): Promise<WorkspaceId>

  /** Tear down and remove a workspace. */
  removeWorkspace(id: WorkspaceId): Promise<void>
}

/**
 * Serializable configuration for creating a new workspace.
 * Intent-based — the global app figures out how to provision it.
 */
export interface CreateWorkspaceConfig {
  readonly name?: string
  readonly hosting?: SerialisedWorkspaceHosting
  readonly config?: unknown
}
