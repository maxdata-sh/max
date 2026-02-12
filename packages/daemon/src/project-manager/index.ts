// Data types
export type { PendingInstallation, ManagedInstallation, InstallationInfo } from "./types.js";

// Service
export { ProjectManager } from "./project-manager.js";

// Errors
export {
  Project,
  ErrInstallationNotFound,
  ErrInstallationAlreadyExists,
  ErrProjectNotInitialised,
} from "./errors.js";
