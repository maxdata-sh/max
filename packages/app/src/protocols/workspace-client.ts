/**
 * WorkspaceClient — Manages installations. Provides cross-installation operations.
 *
 * A workspace groups installations and provides unified access across them.
 * This is what the current codebase calls a "project" (MaxProjectApp).
 *
 * Extends Supervised — every workspace exposes health/start/stop to its
 * parent (the global level).
 */

import type { InstallationId, Supervised, Supervisor } from "@max/core"
import type { InstallationClient } from "./installation-client.js"

export interface WorkspaceClient extends Supervised {
  /** Supervisor over all installations in this workspace. */
  readonly installations: Supervisor<InstallationClient, InstallationId>

  /** Synchronous lookup of a single installation by its parent-assigned ID. */
  installation(id: InstallationId): InstallationClient | undefined
}
