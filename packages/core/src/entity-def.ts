/**
 * Entity definition interface.
 */

import type { FieldDefinitions } from "./field.js";
import { type Ref, RefImpl, type LocalRef } from "./ref.js";
import type { Scope, LocalScope } from "./scope.js";
import type { EntityId } from "./ref-key.js";

export interface EntityDef<Fields extends FieldDefinitions = FieldDefinitions> {
  readonly name: string;
  readonly fields: Fields;

  /** Create a local-scoped reference to an entity of this type */
  ref(id: EntityId): LocalRef<this>;

  /** Create a reference with explicit scope */
  ref<S extends Scope>(id: EntityId, scope: S): Ref<this, S>;
}

export type EntityDefAny = EntityDef<FieldDefinitions>;

/** Standard implementation of EntityDef */
export class EntityDefImpl<T extends FieldDefinitions> implements EntityDef<T> {
  constructor(
    readonly name: string,
    readonly fields: T
  ) {}

  ref(id: EntityId): LocalRef<this>;
  ref<S extends Scope>(id: EntityId, scope: S): Ref<this, S>;
  ref<S extends Scope>(id: EntityId, scope?: S): Ref<this, S | LocalScope> {
    if (scope) {
      return RefImpl.create(this, id, scope);
    }
    return RefImpl.local(this, id);
  }
}
