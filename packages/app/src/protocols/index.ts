/**
 * Protocol surfaces — level-specific interfaces for the federation hierarchy.
 *
 * Each level has a specific protocol defining what messages it accepts and
 * what operations it supports. These are delivered over the uniform Transport
 * abstraction from @max/core.
 */

export type { InstallationProtocol } from "./installation-protocol.js"
export type { WorkspaceProtocol } from "./workspace-protocol.js"
export type { GlobalProtocol } from "./global-protocol.js"
