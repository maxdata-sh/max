/**
 * GlobalProtocol — Entry point. Manages workspaces.
 *
 * The top of the federation hierarchy. Knows about all workspaces available
 * to this host or application.
 *
 * Extends Supervised — the global level itself has a lifecycle (though in
 * practice, the CLI or cloud control plane manages it directly).
 */

import type { WorkspaceId, Supervised, Supervisor } from "@max/core"
import type { WorkspaceProtocol } from "./workspace-protocol.js"

export interface GlobalProtocol extends Supervised {
  /** Supervisor over all workspaces. */
  readonly workspaces: Supervisor<WorkspaceProtocol, WorkspaceId>

  /** Synchronous lookup of a single workspace by its parent-assigned ID. */
  workspace(id: WorkspaceId): WorkspaceProtocol | undefined
}
