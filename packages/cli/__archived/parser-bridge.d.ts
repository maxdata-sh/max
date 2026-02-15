import type { Parser, Mode } from "@optique/core/parser";
import type { CommandDefAny } from "@max/daemon";
import type { InferContext, Context } from "@max/core";
/**
 * Build an Optique parser from a CommandDef's param metadata.
 *
 * Mapping:
 *   Param.string({ required: true })       → argument (positional)
 *   Param.string({ required: true, oneOf }) → argument with async suggest
 *   Param.string()                          → optional(option("--name", string()))
 *   Param.boolean()                         → optional(option("--name"))
 *   Param.number({ required: true })        → argument(integer())
 *   Param.number()                          → optional(option("--name", integer()))
 *   Any param with oneOf                    → async ValueParser with suggest
 */
export declare function parserFromCommand(cmd: CommandDefAny, ctx: InferContext<Context>): Parser<Mode, Record<string, unknown>, unknown>;
//# sourceMappingURL=parser-bridge.d.ts.map