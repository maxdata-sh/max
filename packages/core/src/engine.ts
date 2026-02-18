/**
 * Engine interface - the main API for loading and storing entities.
 */

import type { EntityDefAny } from "./entity-def.js";
import type { EntityInput } from "./entity-input.js";
import type { EntityResult } from "./entity-result.js";
import {
  CollectionKeys,
  CollectionTargetRef,
  EntityFieldsKeys,
  EntityFields,
  EntityFieldsPick,
} from './field-types.js'
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
  load<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K>
  ): Promise<EntityResult<E, K>>

  load<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: FieldsAll | '*'
  ): Promise<EntityResult<E, EntityFieldsKeys<E>>>

  /**
   * Load a single field directly.
   */
  loadField<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    ref: Ref<E>,
    field: K
  ): Promise<EntityFields<E>[K]>

  /**
   * Load a collection field with pagination.
   */
  loadCollection<E extends EntityDefAny, K extends CollectionKeys<E>>(
    ref: Ref<E>,
    field: K,
    options?: PageRequest
  ): Promise<Page<CollectionTargetRef<E, K>>>

  /**
   * Store entity data.
   * Accepts a complete EntityInput (self-sufficient).
   */
  store<E extends EntityDefAny>(input: EntityInput<E>): Promise<Ref<E>>

  /**
   * Load a page of entities by type, with projection controlling the output shape.
   * Cursors are RefKey strings.
   *
   * FIXME: introduce a scope-aware page type (generalized MaxPage) that can hold
   *  both Refs and EntityResults and knows how to upgradeScope. Currently returns
   *  plain Page with RefKey cursors; consumers use MaxPage.fromPage() when they
   *  need scope upgrading.
   */
  loadPage<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    def: E,
    // FIXME: CLAUDE: We have two mechanisms to supply projections - Fields.select and Projection.select
    //  they are basically identical - we need to unify these
    projection: FieldsSelect<E, K>,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, K>>>

  loadPage<E extends EntityDefAny>(
    def: E,
    projection: AllProjection,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>

  loadPage<E extends EntityDefAny>(
    def: E,
    projection: RefsProjection,
    page?: PageRequest
  ): Promise<Page<Ref<E>>>

  /**
   * Query entities. Takes a finalized EntityQuery descriptor
   * (built via Query.from(def).where(...).select(...) etc.)
   * and returns a paged result.
   */
  query<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    query: EntityQuery<E, SelectProjection<E, K>>
  ): Promise<Page<EntityResult<E, K>>>

  query<E extends EntityDefAny>(query: EntityQuery<E, RefsProjection>): Promise<Page<Ref<E>>>

  query<E extends EntityDefAny>(
    query: EntityQuery<E, AllProjection>
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>
}
