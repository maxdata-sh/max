/**
 * EntityInput - a complete upsert request.
 * Contains everything needed to store an entity.
 */

import type { EntityDefAny } from "./entity-def.js";
import type { EntityFields } from "./field-types.js";
import type { Ref } from "./ref.js";

/**
 * EntityInput - a complete upsert request.
 * Contains everything needed to store an entity.
 * Can be passed around, returned from functions, etc.
 */
export interface EntityInput<E extends EntityDefAny = EntityDefAny> {
  /** Reference to the entity (carries type + id) */
  readonly ref: Ref<E>;

  /** Field values to store */
  readonly fields: Partial<EntityFields<E>>;
}

/** Any EntityInput */
export type EntityInputAny = EntityInput<EntityDefAny>;

/** Helper class for creating EntityInput */
export class EntityInputOf<E extends EntityDefAny> implements EntityInput<E> {
  constructor(
    readonly ref: Ref<E>,
    readonly fields: Partial<EntityFields<E>>
  ) {}

  /** Create from ref and fields */
  static create<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: Partial<EntityFields<E>>
  ): EntityInput<E> {
    return new EntityInputOf(ref, fields);
  }

  /** Create from def, id, and fields */
  static from<E extends EntityDefAny>(
    def: E,
    id: string,
    fields: Partial<EntityFields<E>>
  ): EntityInput<E> {
    return new EntityInputOf(def.ref(id), fields);
  }
}
