// Data types
export type { PendingInstallation, ManagedInstallation, InstallationInfo } from "./types.js";

// Interface
export type { ProjectManager } from "./project-manager.js";

// Implementations
export { FsProjectManager } from "./fs-project-manager.js";

// Utilities
export { findProjectRoot } from "./find-project-root.js";

// Errors
export {
  Project,
  ErrInstallationNotFound,
  ErrInstallationAlreadyExists,
  ErrCannotInitialiseProject,
  ErrProjectNotInitialised,
} from "./errors.js";
