import type { CommandDefAny } from "../command.js";
import { initCommand } from "./init.js";
import { schemaCommand } from "./schema.js";
import { connectCommand } from "./connect.js";

export const commands: ReadonlyMap<string, CommandDefAny> = new Map<string, CommandDefAny>([
  [initCommand.name, initCommand],
  [schemaCommand.name, schemaCommand],
  [connectCommand.name, connectCommand],
]);
