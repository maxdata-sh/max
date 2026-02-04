/**
 * Type utilities for extracting TypeScript types from field definitions.
 */

import type { EntityDefAny } from "./entity-def.js";
import type { CollectionField, FieldDef, RefField, ScalarField } from "./field.js";
import type { Ref } from "./ref.js";

/** Extract TypeScript type for a field */
export type FieldType<F extends FieldDef> =
  F extends ScalarField<"string"> ? string :
  F extends ScalarField<"number"> ? number :
  F extends ScalarField<"boolean"> ? boolean :
  F extends ScalarField<"date"> ? Date :
  F extends RefField<infer T> ? Ref<T> :
  F extends CollectionField<infer T> ? Ref<T>[] :
  never;

/** Extract all field types for an entity */
export type EntityFields<E extends EntityDefAny> = {
  [K in keyof E["fields"]]: FieldType<E["fields"][K]>;
};

/** Extract the target entity type from a CollectionField */
export type CollectionTarget<F> = F extends CollectionField<infer T> ? T : never;

/** Get keys that are collection fields */
export type CollectionKeys<E extends EntityDefAny> = {
  [K in keyof E["fields"]]: E["fields"][K] extends CollectionField ? K : never
}[keyof E["fields"]];
