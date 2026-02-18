/**
 * GlobalClient — Entry point. Manages workspaces.
 *
 * The top of the federation hierarchy. Knows about all workspaces available
 * to this host or application.
 *
 * Extends Supervised — the global level itself has a lifecycle (though in
 * practice, the CLI or cloud control plane manages it directly).
 */

import type { WorkspaceId, Supervised, Supervisor } from "@max/core"
import type { WorkspaceClient } from "./workspace-client.js"
import {WorkspaceSupervisor} from "../federation/supervisors.js";

export interface GlobalClient extends Supervised {
  /** Supervisor over all workspaces. */
  readonly workspaceSupervisor: WorkspaceSupervisor

  /** Synchronous lookup of a single workspace by its parent-assigned ID. */
  workspace(id: WorkspaceId): WorkspaceClient | undefined
}
