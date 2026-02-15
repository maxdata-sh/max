import { object } from "@optique/core/constructs";
import { argument, option } from "@optique/core/primitives";
import { optional } from "@optique/core/modifiers";
import { string, integer } from "@optique/core/valueparser";
import { message } from "@optique/core/message";
import type { ValueParser, ValueParserResult } from "@optique/core/valueparser";
import type { Suggestion, Parser, Mode } from "@optique/core/parser";
import type { CommandDefAny, ParamDef } from "@max/daemon";
import type { InferContext, Context } from "@max/core";

/**
 * Create an async Optique ValueParser from a ParamDef with oneOf.
 * Closes over ctx so suggest() can call oneOf.values(ctx).
 */
function oneOfValueParser(
  paramDef: ParamDef,
  ctx: InferContext<Context>,
): ValueParser<"async", string> {
  return {
    $mode: "async" as const,
    metavar: (paramDef.desc ?? "VALUE") as "VALUE",
    async parse(input: string): Promise<ValueParserResult<string>> {
      return { success: true, value: input };
    },
    format(value: string): string {
      return value;
    },
    async *suggest(prefix: string): AsyncGenerator<Suggestion> {
      if (!paramDef.oneOf) return;
      const values = await paramDef.oneOf.values(ctx);
      for (const v of values) {
        const text = String(v);
        if (text.startsWith(prefix)) {
          yield { kind: "literal" as const, text, description: message`${text}` };
        }
      }
    },
  };
}

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
export function parserFromCommand(
  cmd: CommandDefAny,
  ctx: InferContext<Context>,
): Parser<Mode, Record<string, unknown>, unknown> {
  const parsers: Record<string, Parser<Mode, unknown, unknown>> = {};

  for (const [name, paramDef] of Object.entries(cmd.params)) {
    if (paramDef.type === "boolean") {
      // Boolean → optional flag
      parsers[name] = optional(option(`--${name}`));
    } else if (paramDef.required) {
      // Required → positional argument
      if (paramDef.oneOf) {
        parsers[name] = argument(oneOfValueParser(paramDef, ctx));
      } else if (paramDef.type === "number") {
        parsers[name] = argument(integer());
      } else {
        parsers[name] = argument(string({ metavar: name.toUpperCase() as "VALUE" }));
      }
    } else {
      // Optional → flag with value
      if (paramDef.oneOf) {
        parsers[name] = optional(option(`--${name}`, oneOfValueParser(paramDef, ctx)));
      } else if (paramDef.type === "number") {
        parsers[name] = optional(option(`--${name}`, integer()));
      } else {
        parsers[name] = optional(option(`--${name}`, string()));
      }
    }
  }

  return object(parsers) as Parser<Mode, Record<string, unknown>, unknown>;
}
