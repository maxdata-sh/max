/**
 * EntityResult - wrapper around loaded entity data.
 */

import type { EntityDefAny } from "./entity-def.js";
import  { EntityFields, EntityFieldsPick} from "./field-types.js";
import type { Ref, RefAny } from "./ref.js";
import {StaticTypeCompanion} from "./companion.js";
import {ErrFieldNotLoaded} from "./errors/errors.js";
import {Scope} from "./scope.js";
import {Inspect} from "./inspect.js";

/**
 * Proxy type for direct field access via .fields
 */
export type FieldsProxy<
  E extends EntityDefAny,
  Loaded extends keyof EntityFields<E>
> = {
  readonly [K in Loaded]: EntityFields<E>[K];
};

/**
 * EntityResult<E, Loaded> - wrapper around loaded entity data.
 *
 * Two ways to access fields:
 * - result.get("name")     - explicit, type-safe
 * - result.fields.name     - proxy, feels like object access
 *
 * Create using:
 *   EntityResult.from(ref, { name: "Alice", age: 30 })
 */
export interface EntityResult<
  E extends EntityDefAny = EntityDefAny,
  Loaded extends keyof EntityFields<E> = keyof EntityFields<E>,
  S extends Scope = Scope
> {
  readonly def: E;
  readonly ref: Ref<E,S>;

  /** Proxy for direct field access */
  readonly fields: FieldsProxy<E, Loaded>;

  /** Explicit field access */
  get<K extends Loaded>(field: K): EntityFields<E>[K];

  /** Access field that may not be loaded */
  maybeGet<K extends keyof EntityFields<E>>(field: K): EntityFields<E>[K] | undefined;

  /** Check if field is loaded */
  has(field: keyof EntityFields<E>): boolean;

  /** Get loaded field names */
  loadedFields(): (Loaded extends string ? Loaded : never)[];

  /** Convert to plain object */
  toObject(): { [K in Loaded]: EntityFields<E>[K] };
}

/**
 * EntityResultAny - accepts any EntityResult.
 */
export interface EntityResultAny {
  readonly def: EntityDefAny;
  readonly ref: RefAny;
  readonly fields: Record<string, unknown>;
  get(field: string): unknown;
  maybeGet(field: string): unknown;
  has(field: string): boolean;
  loadedFields(): string[];
  toObject(): Record<string, unknown>;
}

// Verify compatibility
type _CheckCompatibility = EntityResult<EntityDefAny, string> extends EntityResultAny ? true : never;

// ============================================================================
// EntityResult Implementation (internal)
// ============================================================================

class EntityResultImpl<
  E extends EntityDefAny,
  Loaded extends keyof EntityFields<E>
> implements EntityResult<E, Loaded> {
  private readonly data: Map<string, unknown>;
  readonly fields: FieldsProxy<E, Loaded>;

  static {
    Inspect(this, (self,opts) => {
      return {
        format: `EntityResult<%s>(%O, %O)`,
        params: [self.ref.entityDef.name, self.ref.toKey(), self.data]
      }
    })
  }

  constructor(
    readonly def: E,
    readonly ref: Ref<E>,
    data: { [K in Loaded]: EntityFields<E>[K] }
  ) {
    this.data = new Map(Object.entries(data));

    // Create proxy for .fields access
    this.fields = new Proxy({} as FieldsProxy<E, Loaded>, {
      get: (_, prop: string) => {
        if (!this.data.has(prop)) {
          throw ErrFieldNotLoaded.create({ entityType: this.def.name, field: prop });
        }
        return this.data.get(prop);
      },
      has: (_, prop: string) => this.data.has(prop),
      ownKeys: () => Array.from(this.data.keys()),
      getOwnPropertyDescriptor: (_, prop: string) => {
        if (this.data.has(prop)) {
          return { configurable: true, enumerable: true, value: this.data.get(prop) };
        }
        return undefined;
      },
    });
  }

  get<K extends Loaded>(field: K): EntityFields<E>[K] {
    if (!this.data.has(field as string)) {
      throw ErrFieldNotLoaded.create({ entityType: this.def.name, field: String(field) });
    }
    return this.data.get(field as string) as EntityFields<E>[K];
  }

  maybeGet<K extends keyof EntityFields<E>>(field: K): EntityFields<E>[K] | undefined {
    return this.data.get(field as string) as EntityFields<E>[K] | undefined;
  }

  has(field: keyof EntityFields<E>): boolean {
    return this.data.has(field as string);
  }

  loadedFields(): (Loaded extends string ? Loaded : never)[] {
    return Array.from(this.data.keys()) as (Loaded extends string ? Loaded : never)[];
  }

  toObject(): { [K in Loaded]: EntityFields<E>[K] } {
    return Object.fromEntries(this.data) as { [K in Loaded]: EntityFields<E>[K] };
  }
}

// ============================================================================
// EntityResult Static Methods (namespace merge)
// ============================================================================

/** Static methods for creating EntityResults */
export const EntityResult = StaticTypeCompanion({
  /** Create an EntityResult from a ref and field data */
  from<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    data: EntityFieldsPick<E,K>
  ): EntityResult<E, K> {
    return new EntityResultImpl(ref.entityDef, ref, data)
  },
})
