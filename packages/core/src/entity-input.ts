/**
 * EntityInput - a complete upsert request.
 * Contains everything needed to store an entity.
 */

import type { EntityDefAny } from "./entity-def.js";
import type { EntityFields } from "./field-types.js";
import type { Ref } from "./ref.js";
import {StaticTypeCompanion} from "./companion.js";
import {EntityId} from "./core-id-types.js";

/**
 * EntityInput<E> - a complete upsert request.
 *
 * Contains everything needed to store an entity.
 * Can be passed around, returned from functions, etc.
 *
 * Create using:
 *   EntityInput.create(ref, { name: "Alice" })
 *   EntityInput.from(AcmeUser, "u1", { name: "Alice" })
 */
export interface EntityInput<E extends EntityDefAny = EntityDefAny> {
  /** Reference to the entity (carries type + id) */
  readonly ref: Ref<E>;

  /** Field values to store */
  readonly fields: Partial<EntityFields<E>>;
}

/** Any EntityInput */
export type EntityInputAny = EntityInput<EntityDefAny>;

// ============================================================================
// EntityInput Implementation (internal)
// ============================================================================

class EntityInputImpl<E extends EntityDefAny> implements EntityInput<E> {
  constructor(
    readonly ref: Ref<E>,
    readonly fields: Partial<EntityFields<E>>
  ) {}
}

// ============================================================================
// EntityInput Static Methods (namespace merge)
// ============================================================================

/** Static methods for creating EntityInputs */
export const EntityInput = StaticTypeCompanion({
  /** Create from ref and fields */
  create<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: Partial<EntityFields<E>>
  ): EntityInput<E> {
    return new EntityInputImpl(ref, fields);
  },

  /** Create from def, id, and fields */
  from<E extends EntityDefAny>(
    def: E,
    id: EntityId,
    fields: Partial<EntityFields<E>>
  ): EntityInput<E> {
    return new EntityInputImpl(def.ref(id), fields);
  },
})
