/**
 * Federation — Level implementations and supporting infrastructure.
 */

export { DefaultSupervisor } from "./default-supervisor.js"
export { WorkspaceMax } from "./workspace-max.js"
export { GlobalMax } from "./global-max.js"
export { FsInstallationRegistry } from "./fs-installation-registry.js"
export { Registry, ErrRegistryEntryNotFound, ErrRegistryEntryAlreadyExists } from "./errors.js"
export type { InstallationHandle, WorkspaceHandle } from "./handle-types.js"
export type { MaxJsonFile, MaxJsonInstallation } from "./max-json.js"
