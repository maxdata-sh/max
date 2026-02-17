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
import type { EntityQuery, SelectProjection, RefsProjection, AllProjection } from "./query.js";
import type { Ref } from "./ref.js";
import {Scope} from "./scope.js";

export interface Engine<TScope extends Scope = Scope> extends Lifecycle {
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
   * Load a page of entities by type, with projection controlling the output shape.
   */
  loadPage<E extends EntityDefAny>(
    def: E,
    projection: RefsProjection,
    page?: PageRequest
  ): Promise<Page<Ref<E>>>;

  loadPage<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    def: E,
    projection: SelectProjection<K & string>,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, K>>>;

  loadPage<E extends EntityDefAny>(
    def: E,
    projection: AllProjection,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, keyof EntityFields<E>>>>;

  /**
   * Query entities. Takes a finalized EntityQuery descriptor
   * (built via Query.from(def).where(...).select(...) etc.)
   * and returns a paged result.
   */
  query<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    query: EntityQuery<E, SelectProjection<K & string>>
  ): Promise<Page<EntityResult<E, K>>>;

  query<E extends EntityDefAny>(
    query: EntityQuery<E, RefsProjection>
  ): Promise<Page<Ref<E>>>;

  query<E extends EntityDefAny>(
    query: EntityQuery<E, AllProjection>
  ): Promise<Page<EntityResult<E, keyof EntityFields<E>>>>;
}
