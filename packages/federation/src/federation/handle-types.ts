/**
 * Named handle type aliases — convenience types used throughout the codebase
 * instead of repeating the verbose generic form.
 */

import type { NodeHandle, UnlabelledHandle, InstallationId, WorkspaceId } from "@max/core"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { WorkspaceClient } from "../protocols/workspace-client.js"

/** A parent's handle to one installation node (labelled with ID). */
export type InstallationHandle = NodeHandle<InstallationClient, InstallationId>

/** A parent's handle to one workspace node (labelled with ID). */
export type WorkspaceHandle = NodeHandle<WorkspaceClient, WorkspaceId>

/** An unlabelled installation handle — returned by providers before ID assignment. */
export type UnlabelledInstallationHandle = UnlabelledHandle<InstallationClient>

/** An unlabelled workspace handle — returned by providers before ID assignment. */
export type UnlabelledWorkspaceHandle = UnlabelledHandle<WorkspaceClient>
