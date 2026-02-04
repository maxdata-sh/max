/**
 * Fields selector for specifying which fields to load.
 */

import type { EntityDefAny } from "./entity-def.js";
import type { EntityFields } from "./field-types.js";

export interface FieldsSelect<
  E extends EntityDefAny,
  K extends keyof EntityFields<E>
> {
  kind: "select";
  fields: K[];
}

export interface FieldsAll {
  kind: "all";
}

export type FieldSelector<E extends EntityDefAny> =
  | FieldsSelect<E, keyof EntityFields<E>>
  | FieldsAll;

export const Fields = {
  select<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ...fields: K[]
  ): FieldsSelect<E, K> {
    return { kind: "select", fields };
  },

  ALL: { kind: "all" } as FieldsAll,
} as const;
