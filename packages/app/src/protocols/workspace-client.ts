/**
 * WorkspaceClient — Manages installations. Provides cross-installation operations.
 *
 * A workspace groups installations and provides unified access across them.
 * This is what the current codebase calls a "project" (MaxProjectApp).
 *
 * Extends Supervised — every workspace exposes health/start/stop to its
 * parent (the global level).
 *
 * Supervisor is internal to WorkspaceMax — not exposed on the client surface.
 * The client has explicit intent-based methods instead (listInstallations,
 * createInstallation, removeInstallation). These work identically in-process
 * and over RPC.
 */

import type { ConnectorType, InstallationId, ProviderKind, Supervised } from "@max/core"
import type { InstallationClient } from "./installation-client.js"
import type { InstallationInfo } from "../project-manager/types.js"

export interface WorkspaceClient extends Supervised {
  /** List all installations in this workspace. */
  listInstallations(): Promise<InstallationInfo[]>

  /** Synchronous lookup of a single installation by its parent-assigned ID. */
  installation(id: InstallationId): InstallationClient | undefined

  /** Create a new installation from serializable config. */
  createInstallation(config: CreateInstallationConfig): Promise<InstallationClient>

  /** Tear down and remove an installation. */
  removeInstallation(id: InstallationId): Promise<void>
}

/**
 * Serializable configuration for creating a new installation.
 * Intent-based — the workspace figures out how to provision it.
 */
export interface CreateInstallationConfig {
  readonly connector: ConnectorType
  readonly name?: string
  readonly providerKind?: ProviderKind
  readonly config?: unknown
}
