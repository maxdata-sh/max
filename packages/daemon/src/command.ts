import { StaticTypeCompanion } from "@max/core";
import type { Context, InferContext, ClassOf } from "@max/core";
import type { ParamDef, ParamDefs } from "./param.js";

/** Keys where the ParamDef has required: true */
type RequiredKeys<P extends ParamDefs> = {
  [K in keyof P]: P[K] extends { readonly required: true } ? K : never;
}[keyof P];

/** Keys where the ParamDef does not have required: true */
type OptionalKeys<P extends ParamDefs> = Exclude<keyof P, RequiredKeys<P>>;

/** Resolve ParamDef<T> → T, making required params non-optional */
export type ResolvedParams<P extends ParamDefs> = {
  [K in RequiredKeys<P>]: P[K] extends ParamDef<infer T> ? T : never;
} & {
  [K in OptionalKeys<P>]?: P[K] extends ParamDef<infer T> ? T : never;
};

export interface CommandDef<P extends ParamDefs = ParamDefs, C extends Context = Context> {
  readonly name: string;
  readonly desc: string;
  readonly context: ClassOf<C>;
  readonly params: P;
  run(params: ResolvedParams<P>, ctx: InferContext<C>): unknown | Promise<unknown>;
}

export type CommandDefAny = CommandDef<ParamDefs, Context>;

export const Command = StaticTypeCompanion({
  define<const P extends ParamDefs, C extends Context>(def: {
    name: string;
    desc: string;
    context: ClassOf<C>;
    params: P;
    run(params: ResolvedParams<P>, ctx: InferContext<C>): unknown | Promise<unknown>;
  }): CommandDef<P, C> {
    return def;
  },
});
