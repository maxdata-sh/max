/**
 * Protocol surfaces — level-specific interfaces for the federation hierarchy.
 *
 * Each level has a specific protocol defining what messages it accepts and
 * what operations it supports. These are delivered over the uniform Transport
 * abstraction from @max/core.
 */

export type { InstallationClient } from "./installation-client.js"
export type { WorkspaceClient, CreateInstallationConfig } from "./workspace-client.js"
export type { GlobalClient } from "./global-client.js"
