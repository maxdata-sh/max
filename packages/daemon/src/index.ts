// Command system
export { Command } from "./command.js";
export type { CommandDef, CommandDefAny, ResolvedParams } from "./command.js";
export { Param } from "./param.js";
export type { ParamDef, ParamDefs, ParamDefAny, OneOfDef } from "./param.js";
export { execute } from "./execute.js";

// Context
export { DaemonContext } from "./context.js";

// Commands
export { commands } from "./commands/index.js";

// Errors
export { Daemon, ErrMissingParam, ErrInvalidParam, ErrUnknownCommand, ErrConnectorNotFound } from "./errors.js";

// ProjectManager
export type { ProjectManager } from "./project-manager/index.js";
export { FsProjectManager, findProjectRoot } from "./project-manager/index.js";
export { Project, ErrInstallationNotFound, ErrInstallationAlreadyExists, ErrProjectNotInitialised } from "./project-manager/index.js";
export type { PendingInstallation, ManagedInstallation, InstallationInfo } from "./project-manager/index.js";

// Socket protocol types (used by cli)
export type { Request, Response } from "./types.js";
