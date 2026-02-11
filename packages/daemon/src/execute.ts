import type { Context, InferContext } from "@max/core";
import type { CommandDefAny } from "./command.js";
import { ErrMissingParam, ErrInvalidParam } from "./errors.js";

export async function execute(
  command: CommandDefAny,
  rawParams: Record<string, unknown>,
  ctx: InferContext<Context>,
): Promise<unknown> {
  const validated: Record<string, unknown> = {};

  for (const [key, paramDef] of Object.entries(command.params)) {
    const value = rawParams[key];

    if (paramDef.required && (value === undefined || value === null || value === "")) {
      throw ErrMissingParam.create({ param: key });
    }

    if (value === undefined) continue;

    if (paramDef.oneOf) {
      const allowed = await paramDef.oneOf.values(ctx);
      if (!allowed.includes(value as never)) {
        if (paramDef.oneOf.orThrow) {
          throw paramDef.oneOf.orThrow(value);
        }
        throw ErrInvalidParam.create({ param: key, value: String(value) });
      }
    }

    validated[key] = value;
  }

  return command.run(validated as never, ctx as never);
}
