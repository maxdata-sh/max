/**
 * Named handle type aliases — convenience types used throughout the codebase
 * instead of repeating the verbose generic form.
 */

import type { NodeHandle, InstallationId, WorkspaceId } from "@max/core"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { WorkspaceClient } from "../protocols/workspace-client.js"

/** A parent's handle to one installation node. */
export type InstallationHandle = NodeHandle<InstallationClient, InstallationId>

/** A parent's handle to one workspace node. */
export type WorkspaceHandle = NodeHandle<WorkspaceClient, WorkspaceId>
