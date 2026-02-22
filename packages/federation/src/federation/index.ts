/**
 * Federation — Level implementations and supporting infrastructure.
 */

export { DefaultSupervisor } from './default-supervisor.js'

export { GlobalMax } from './global-max.js'

export { Registry, ErrRegistryEntryNotFound, ErrRegistryEntryAlreadyExists } from './errors.js'
export type {
  InstallationHandle,
  WorkspaceHandle,
  UnlabelledInstallationHandle,
  UnlabelledWorkspaceHandle,
} from './handle-types.js'
export type { MaxJsonFile, MaxJsonInstallation } from './max-json.js'
export type { WorkspaceSupervisor, InstallationSupervisor } from './supervisors.js'

export { WorkspaceMax } from './workspace-max.js'
export type { MaxUrlResolver, ResolvedTarget } from './max-url-resolver.js'
export { hasInstallationNameLookup } from './max-url-resolver.js'
export {
  type WorkspaceRegistry,
  type WorkspaceRegistryEntry,
  InMemoryWorkspaceRegistry,
} from './workspace-registry.js'

export { InstallationMax } from './installation-max.js'
export { bootstrapInstallation, type ResolvedInstallationDeps } from './bootstrap/bootstrap-installation.js'
export {
  bootstrapWorkspace,
  type ResolvedWorkspaceDeps,
} from './bootstrap/bootstrap-workspace.js'
export {
  type InstallationRegistry,
  type InstallationRegistryEntry,
  type InstallationInfo,
  InMemoryInstallationRegistry,
} from './installation-registry.js'

