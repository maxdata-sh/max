// Command system
export { Param } from "./param.js";
export type { ParamDef, ParamDefs, ParamDefAny, OneOfDef } from "./param.js";


// Errors
export { Daemon, ErrMissingParam, ErrInvalidParam, ErrUnknownCommand, ErrNoOnboarding } from "./errors.js";

// Socket protocol types (used by cli)
export type { Request } from "./types.js";
