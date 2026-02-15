/**
 * Engine interface - the main API for loading and storing entities.
 */

import type { EntityDefAny } from "./entity-def.js";
import type { EntityInput } from "./entity-input.js";
import type { EntityResult } from "./entity-result.js";
import type { CollectionKeys, CollectionTargetRef, EntityFields } from "./field-types.js";
import type { FieldsAll, FieldsSelect } from "./fields-selector.js";
import type { Lifecycle } from "./lifecycle.js";
import type { Page, PageRequest } from "./pagination.js";
import type { Ref } from "./ref.js";

export interface Engine extends Lifecycle {
  /**
   * Load specific fields of an entity.
   */
  load<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K>
  ): Promise<EntityResult<E, K>>;

  load<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: FieldsAll | "*"
  ): Promise<EntityResult<E, keyof EntityFields<E>>>;

  /**
   * Load a single field directly.
   */
  loadField<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    field: K
  ): Promise<EntityFields<E>[K]>;

  /**
   * Load a collection field with pagination.
   */
  loadCollection<E extends EntityDefAny, K extends CollectionKeys<E>>(
    ref: Ref<E>,
    field: K,
    options?: PageRequest
  ): Promise<Page<CollectionTargetRef<E, K>>>;

  /**
   * Store entity data.
   * Accepts a complete EntityInput (self-sufficient).
   */
  store<E extends EntityDefAny>(input: EntityInput<E>): Promise<Ref<E>>;

  /**
   * Query entities.
   */
  query<E extends EntityDefAny>(def: E): QueryBuilder<E>;


}

export interface QueryBuilder<E extends EntityDefAny> {
  where<K extends keyof EntityFields<E>>(
    field: K,
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains",
    value: EntityFields<E>[K]
  ): QueryBuilder<E>;

  limit(n: number): QueryBuilder<E>;
  offset(n: number): QueryBuilder<E>;
  orderBy<K extends keyof EntityFields<E>>(field: K, dir?: "asc" | "desc"): QueryBuilder<E>;

  refs(): Promise<Ref<E>[]>;
  select<K extends keyof EntityFields<E>>(...fields: K[]): Promise<EntityResult<E, K>[]>;
  selectAll(): Promise<EntityResult<E, keyof EntityFields<E>>[]>;
}

export type QueryBuilderAny = QueryBuilder<EntityDefAny>;
