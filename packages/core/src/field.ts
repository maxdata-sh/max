/**
 * Field definitions for entity schemas.
 */

import type { EntityDefAny } from "./entity-def.js";

export type ScalarType = "string" | "number" | "boolean" | "date";

export interface ScalarField<T extends ScalarType = ScalarType> {
  kind: "scalar";
  type: T;
}

export interface RefField<T extends EntityDefAny = EntityDefAny> {
  kind: "ref";
  target: T;
}

export interface CollectionField<T extends EntityDefAny = EntityDefAny> {
  kind: "collection";
  target: T;
}

export type FieldDef = ScalarField | RefField | CollectionField;

/** Record type that maps field names to field definitions */
export type FieldDefinitions = { [key: string]: FieldDef };

export const Field = {
  string: (): ScalarField<"string"> => ({ kind: "scalar", type: "string" }),
  number: (): ScalarField<"number"> => ({ kind: "scalar", type: "number" }),
  boolean: (): ScalarField<"boolean"> => ({ kind: "scalar", type: "boolean" }),
  date: (): ScalarField<"date"> => ({ kind: "scalar", type: "date" }),
  ref: <T extends EntityDefAny>(target: T): RefField<T> => ({ kind: "ref", target }),
  collection: <T extends EntityDefAny>(target: T): CollectionField<T> => ({ kind: "collection", target }),
} as const;
