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

/** Get keys that are collection fields */
export type CollectionKeys<E extends EntityDefAny> = {
  [K in keyof E["fields"]]: E["fields"][K] extends CollectionField ? K : never
}[keyof E["fields"]];

/** Get keys that are NOT collection fields (scalar + ref) */
export type NonCollectionKeys<E extends EntityDefAny> = {
  [K in keyof E["fields"]]: E["fields"][K] extends CollectionField ? never : K
}[keyof E["fields"]];

/** Extract the ref type for a collection field's target */
export type CollectionTargetRef<E extends EntityDefAny, K extends CollectionKeys<E>> =
  E["fields"][K] extends CollectionField<infer T> ? Ref<T> : never;
