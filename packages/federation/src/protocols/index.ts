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

// Client proxies
export { InstallationClientProxy } from "./installation-client-proxy.js"
export { WorkspaceClientProxy } from "./workspace-client-proxy.js"
export { RemoteSyncHandle } from "./remote-sync-handle.js"
export { ScopedTransport } from "./scoped-transport.js"
