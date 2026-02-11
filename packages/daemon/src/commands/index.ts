import type { CommandDefAny } from "../command.js";
import { schemaCommand } from "./schema.js";

export const commands: ReadonlyMap<string, CommandDefAny> = new Map([
  [schemaCommand.name, schemaCommand],
]);
