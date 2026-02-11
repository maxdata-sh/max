import { StaticTypeCompanion } from "@max/core";
import type { MaxError } from "@max/core";

export interface OneOfDef<T = unknown> {
  readonly values: (ctx: any) => T[] | Promise<T[]>;
  readonly orThrow?: (value: unknown) => MaxError;
}

export interface ParamDef<T = unknown, R extends boolean = boolean> {
  readonly type: "string" | "number" | "boolean";
  readonly required: R;
  readonly desc?: string;
  readonly oneOf?: OneOfDef<T>;
}

export type ParamDefs = { readonly [key: string]: ParamDef };
export type ParamDefAny = ParamDef;

export const Param = StaticTypeCompanion({
  string<const R extends boolean = false>(opts?: {
    required?: R;
    desc?: string;
    oneOf?: OneOfDef<string>;
  }): ParamDef<string, R> {
    return { type: "string", required: (opts?.required ?? false) as R, desc: opts?.desc, oneOf: opts?.oneOf };
  },
  boolean(opts?: { desc?: string }): ParamDef<boolean, false> {
    return { type: "boolean", required: false, desc: opts?.desc };
  },
  number<const R extends boolean = false>(opts?: {
    required?: R;
    desc?: string;
    oneOf?: OneOfDef<number>;
  }): ParamDef<number, R> {
    return { type: "number", required: (opts?.required ?? false) as R, desc: opts?.desc, oneOf: opts?.oneOf };
  },

  /** Define allowed values for a param, with optional custom error */
  oneOf<T>(valuesOrOpts: ((ctx: any) => T[] | Promise<T[]>) | { values: (ctx: any) => T[] | Promise<T[]>; orThrow?: (value: unknown) => MaxError }): OneOfDef<T> {
    if (typeof valuesOrOpts === "function") {
      return { values: valuesOrOpts };
    }
    return valuesOrOpts;
  },
});
