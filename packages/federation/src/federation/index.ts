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
export {
  type WorkspaceRegistry,
  type WorkspaceRegistryEntry,
  InMemoryWorkspaceRegistry,
} from './workspace-registry.js'

export { InstallationMax } from './installation-max.js'
export { bootstrapInstallation, type ResolvedInstallationDeps } from './bootstrap.js'
export {
  type InstallationRegistry,
  type InstallationRegistryEntry,
  InMemoryInstallationRegistry,
} from './installation-registry.js'

// FIXME: This should go to platform-bun
export { FsInstallationRegistry } from './fs-installation-registry.js'
