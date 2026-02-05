/**
 * Entity definition interface.
 */

import type { FieldDefinitions } from "./field.js";
import { type Ref, Ref as RefStatic, type LocalRef } from "./ref.js";
import type { Scope, LocalScope } from "./scope.js";
import type { EntityId } from "./ref-key.js";

/**
 * EntityDef<Fields> - Defines an entity type and its fields.
 *
 * Create entity definitions using:
 *   const AcmeUser = EntityDef.create("AcmeUser", { name: Field.string(), ... });
 */
export interface EntityDef<Fields extends FieldDefinitions = FieldDefinitions> {
  readonly name: string;
  readonly fields: Fields;

  /** Create a local-scoped reference to an entity of this type */
  ref(id: EntityId): LocalRef<this>;

  /** Create a reference with explicit scope */
  ref<S extends Scope>(id: EntityId, scope: S): Ref<this, S>;
}

export type EntityDefAny = EntityDef<FieldDefinitions>;

// ============================================================================
// EntityDef Implementation (internal)
// ============================================================================

class EntityDefImpl<T extends FieldDefinitions> implements EntityDef<T> {
  constructor(
    readonly name: string,
    readonly fields: T
  ) {}

  ref(id: EntityId): LocalRef<this>;
  ref<S extends Scope>(id: EntityId, scope: S): Ref<this, S>;
  ref<S extends Scope>(id: EntityId, scope?: S): Ref<this, S | LocalScope> {
    if (scope) {
      return RefStatic.create(this, id, scope);
    }
    return RefStatic.local(this, id);
  }
}

// ============================================================================
// EntityDef Static Methods (namespace merge)
// ============================================================================

/** Static methods for creating EntityDefs */
export const EntityDef = {
  /** Create a new entity definition */
  create<T extends FieldDefinitions>(name: string, fields: T): EntityDef<T> {
    return new EntityDefImpl(name, fields);
  },
} as const;
