/**
 * GlobalClient — Entry point. Manages workspaces.
 *
 * The top of the federation hierarchy. Knows about all workspaces available
 * to this host or application.
 *
 * Extends Supervised — the global level itself has a lifecycle (though in
 * practice, the CLI or cloud control plane manages it directly).
 */

import { type ConfigOf, type DeployerKind, ISODateString, Supervised, WorkspaceId } from '@max/core'
import {  WorkspaceClient } from './workspace-client.js'
import {DeploymentConfig} from "../deployers/index.js";
import {WorkspaceSpec} from "../config/index.js";

export interface WorkspaceInfo {
  readonly id: WorkspaceId
  readonly name: string
  readonly connectedAt: ISODateString
  readonly config: DeploymentConfig
}

export interface CreateWorkspaceArgs<K extends DeployerKind = DeployerKind> {
  via: K
  config: ConfigOf<K>
  spec?: WorkspaceSpec
}

export interface GlobalClient extends Supervised {
  listWorkspaces(): Promise<WorkspaceInfo[]>

  /** Synchronous lookup of a single workspace by its parent-assigned ID. */
  workspace(id: WorkspaceId): WorkspaceClient | undefined

  /** Create a new workspace from serializable config. */
  createWorkspace<K extends DeployerKind>(
    name: string,
    args: CreateWorkspaceArgs<K>
  ): Promise<WorkspaceId>

  /** Tear down and remove a workspace. */
  removeWorkspace(id: WorkspaceId): Promise<void>
}
