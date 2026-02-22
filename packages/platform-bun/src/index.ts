// Platform entry point
export { BunPlatform } from './bun-platform.js'

// Resolver graphs (for .with() overrides and dependency injection)
export {
  installationGraph,
  workspaceGraph,
  globalGraph,
  type InstallationGraphConfig,
  type InstallationGraphDeps,
  type WorkspaceGraphConfig,
  type WorkspaceGraphDeps,
  type GlobalGraphConfig,
  type GlobalGraphDeps,
} from './bun-platform.js'


// Registries
export { FsInstallationRegistry } from './services/fs-installation-registry.js'
export { FsWorkspaceRegistry } from './services/fs-workspace-registry.js'
export { BunConnectorRegistry } from './services/bun-connector-registry.js'

// Credential store
export { FsCredentialStore } from './services/fs-credential-store.js'

// Transport (Bun-specific Unix socket RPC)
export { createRpcSocketServer, type RpcSocketServer, type RpcSocketServerOptions, type RpcDispatchFn } from './rpc-socket-server.js'
export { BunDaemonTransport } from './transports/bun-daemon-transport.js'

// Config (Bun platform concerns)
export { GlobalConfig } from './global-config.js'
export { ProjectConfig, projectHash } from './project-config.js'

// Errors
export * from './errors/errors.js'

// Utilities
export { findProjectRoot } from './util/find-project-root.js'
export { useColor } from './util/use-color.js'
export { initProject } from './util/init-project.js'
