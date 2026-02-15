import { object } from "@optique/core/constructs";
import { argument, option } from "@optique/core/primitives";
import { optional } from "@optique/core/modifiers";
import { string, integer } from "@optique/core/valueparser";
import { message } from "@optique/core/message";
/**
 * Create an async Optique ValueParser from a ParamDef with oneOf.
 * Closes over ctx so suggest() can call oneOf.values(ctx).
 */
function oneOfValueParser(paramDef, ctx) {
    return {
        $mode: "async",
        metavar: (paramDef.desc ?? "VALUE"),
        async parse(input) {
            return { success: true, value: input };
        },
        format(value) {
            return value;
        },
        async *suggest(prefix) {
            if (!paramDef.oneOf)
                return;
            const values = await paramDef.oneOf.values(ctx);
            for (const v of values) {
                const text = String(v);
                if (text.startsWith(prefix)) {
                    yield { kind: "literal", text, description: message `${text}` };
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
export function parserFromCommand(cmd, ctx) {
    const parsers = {};
    for (const [name, paramDef] of Object.entries(cmd.params)) {
        if (paramDef.type === "boolean") {
            // Boolean → optional flag
            parsers[name] = optional(option(`--${name}`));
        }
        else if (paramDef.required) {
            // Required → positional argument
            if (paramDef.oneOf) {
                parsers[name] = argument(oneOfValueParser(paramDef, ctx));
            }
            else if (paramDef.type === "number") {
                parsers[name] = argument(integer());
            }
            else {
                parsers[name] = argument(string({ metavar: name.toUpperCase() }));
            }
        }
        else {
            // Optional → flag with value
            if (paramDef.oneOf) {
                parsers[name] = optional(option(`--${name}`, oneOfValueParser(paramDef, ctx)));
            }
            else if (paramDef.type === "number") {
                parsers[name] = optional(option(`--${name}`, integer()));
            }
            else {
                parsers[name] = optional(option(`--${name}`, string()));
            }
        }
    }
    return object(parsers);
}
