// Platform entry point
export { BunPlatform } from './bun-platform.js'
export type {
  BunInProcessInstallationConfig,
  BunSubprocessInstallationConfig,
  BunInstallationHosting,
  BunInProcessWorkspaceConfig,
  BunWorkspaceHosting,
  BunEngineConfig,
  BunCredentialStoreConfig,
} from './bun-platform.js'

// Providers (also accessible directly for advanced use)
export { BunInProcessInstallationProvider } from './bun-in-process-installation-provider.js'
export { BunInProcessWorkspaceProvider, type BunWorkspaceConfig } from './bun-in-process-workspace-provider.js'
export { SubprocessInstallationProvider } from './subprocess-installation-provider.js'

// Registries
export { FsInstallationRegistry } from './fs-installation-registry.js'
export { FsWorkspaceManifest, type WorkspaceManifestEntry } from './fs-workspace-manifest.js'
export { BunConnectorRegistry } from './bun-connector-registry.js'

// Credential store
export { FsCredentialStore } from './fs-credential-store.js'

// Transport (Bun-specific Unix socket RPC)
export { createRpcSocketServer, type RpcSocketServer, type RpcSocketServerOptions, type RpcDispatchFn } from './rpc-socket-server.js'
export { SubprocessTransport } from './subprocess-transport.js'

// Config (Bun platform concerns)
export { GlobalConfig } from './global-config.js'
export { ProjectConfig, projectHash } from './project-config.js'

// Errors
export { ErrCannotInitialiseProject, ErrProjectNotInitialised, ErrDaemonDisabled } from './errors.js'

// Utilities
export { findProjectRoot } from './find-project-root.js'
export { useColor } from './use-color.js'
export { initProject } from './init-project.js'
