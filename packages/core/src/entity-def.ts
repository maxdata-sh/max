/**
 * Entity definition interface.
 */

import type { Domain } from "./domain.js";
import type { FieldDefinitions } from "./field.js";
import { type Ref, RefOf } from "./ref.js";

export interface EntityDef<Fields extends FieldDefinitions = FieldDefinitions> {
  readonly name: string;
  readonly fields: Fields;

  /** Create a reference to an entity of this type */
  ref(id: string, domain?: Domain): Ref<this>;
}

export type EntityDefAny = EntityDef<FieldDefinitions>;

/** Standard implementation of EntityDef */
export class EntityDefImpl<T extends FieldDefinitions> implements EntityDef<T> {
  constructor(
    readonly name: string,
    readonly fields: T
  ) {}

  ref(id: string, domain?: Domain): Ref<this> {
    return new RefOf(this, id, "indirect", undefined, domain);
  }
}
