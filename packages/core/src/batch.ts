/**
 * Batch<V, K> - Container for batch operation results.
 *
 * Maps keys to values, with tracking of which inputs resolved vs didn't.
 * Values should be self-contained (include their key) so .values() is useful.
 *
 * @example
 * // Build from a list, specifying key extractor
 * const batch = Batch.buildFrom(users).withKey(user => user.id);
 *
 * // Build from EntityInputs (convenience)
 * const batch = Batch.fromInputs(inputs);  // Uses input.ref.toKey()
 *
 * // Access
 * batch.get(key);        // V | undefined
 * batch.getOrThrow(key); // V (throws if missing)
 * batch.values();        // V[] (self-contained)
 */

import { StaticTypeCompanion } from "./companion.js";
import { Lazy } from "./lazy.js";
import { ErrBatchKeyMissing, ErrBatchEmptyDeriveKey } from "./errors/errors.js";

// ============================================================================
// Keyable Interface
// ============================================================================

/**
 * Objects that can be used as batch keys implement this interface.
 * The toKey() method returns a string representation for lookup.
 */
export interface Keyable {
  toKey(): string;
}

/**
 * Valid key types - either a string or an object with toKey()
 */
export type KeyableType = string | Keyable;

/**
 * Extract the string key from a keyable
 */
function toKeyString<K extends KeyableType>(key: K): string {
  if (typeof key === "string") {
    return key;
  }
  return key.toKey();
}

// ============================================================================
// Batch Interface
// ============================================================================

/**
 * Batch<V, K> - A batch result container.
 *
 * V = Value type (what's stored)
 * K = Key type (how values are looked up) - defaults to string
 *
 * Note: V comes first because typically you care more about what's in the batch
 * than how it's keyed. This allows `Batch<User>` to read naturally.
 */
export interface Batch<V, K extends KeyableType = string> {
  /** Number of input keys this batch was created for */
  readonly inputSize: number;

  /** All result values (may be fewer than inputSize if some didn't resolve) */
  readonly values: V[];

  /** Alias for values */
  readonly results: V[];

  /** Whether every input key resolved to a value */
  readonly isFullyResolved: boolean;

  /** Input keys that didn't have corresponding values */
  readonly unresolvableKeys: Set<string>;

  /** Original input objects for keys that didn't resolve */
  readonly unresolvableInputs: K[];

  /** Get a value by key, or undefined if not found */
  get(key: K): V | undefined;

  /** Get a value by key, or throw if not found */
  getOrThrow(key: K): V;

  /** Check if a key exists in the batch */
  has(key: K): boolean;

  /** Get all keys */
  keys(): string[];

  /** Get all entries as [key, value] pairs */
  entries(): [string, V][];

  /** Transform values while preserving keys */
  mapValues<U>(fn: (value: V, key: K) => U): Batch<U, K>;

  /** Create a new batch with different input keys (re-scope) */
  withInputs(newInputs: K[]): Batch<V, K>;

  /** Convert to a sparse record (only resolved keys) */
  toRecord(): Record<string, V>;

  /** Convert to a record with defaults for missing keys */
  toRecordWithDefaults(getDefault: (key: K) => V): Record<string, V>;
}

/** Any Batch */
export type BatchAny = Batch<unknown, KeyableType>;

// ============================================================================
// Batch Implementation
// ============================================================================

class BatchImpl<V, K extends KeyableType> implements Batch<V, K> {
  private inputKeyStrings: string[];
  private lazy: Lazy<{
    recordOfValues: Record<string, V>;
    unresolvableKeys: Set<string>;
    unresolvableInputs: K[];
    inputKeySet: Set<string>;
  }>;

  constructor(
    private inputKeys: K[],
    private _values: V[],
    private keyGetter: (value: V, index: number) => K
  ) {
    this.inputKeyStrings = inputKeys.map(toKeyString);

    this.lazy = new Lazy({
      inputKeySet: () => new Set(this.inputKeyStrings),

      recordOfValues: () => {
        const record: Record<string, V> = {};
        const inputKeySet = this.lazy.read.inputKeySet;

        for (let i = 0; i < this._values.length; i++) {
          const value = this._values[i];
          const key = this.keyGetter(value, i);
          const keyStr = toKeyString(key);

          // Only include if it was in the input keys
          if (inputKeySet.has(keyStr)) {
            record[keyStr] = value;
          }
        }

        return record;
      },

      unresolvableKeys: () => {
        const record = this.lazy.read.recordOfValues;
        const unresolvable = new Set<string>();

        for (const keyStr of this.inputKeyStrings) {
          if (!(keyStr in record)) {
            unresolvable.add(keyStr);
          }
        }

        return unresolvable;
      },

      unresolvableInputs: () => {
        const unresolvableKeys = this.lazy.read.unresolvableKeys;
        return this.inputKeys.filter((k) => unresolvableKeys.has(toKeyString(k)));
      },
    });
  }

  get inputSize(): number {
    return this.inputKeys.length;
  }

  get values(): V[] {
    return this._values;
  }

  get results(): V[] {
    return this._values;
  }

  get isFullyResolved(): boolean {
    return this.lazy.read.unresolvableKeys.size === 0;
  }

  get unresolvableKeys(): Set<string> {
    return this.lazy.read.unresolvableKeys;
  }

  get unresolvableInputs(): K[] {
    return this.lazy.read.unresolvableInputs;
  }

  get(key: K): V | undefined {
    const keyStr = toKeyString(key);
    return this.lazy.read.recordOfValues[keyStr];
  }

  getOrThrow(key: K): V {
    const value = this.get(key);
    if (value === undefined) {
      throw ErrBatchKeyMissing.create({ key: toKeyString(key) });
    }
    return value;
  }

  has(key: K): boolean {
    const keyStr = toKeyString(key);
    return keyStr in this.lazy.read.recordOfValues;
  }

  keys(): string[] {
    return Object.keys(this.lazy.read.recordOfValues);
  }

  entries(): [string, V][] {
    return Object.entries(this.lazy.read.recordOfValues);
  }

  mapValues<U>(fn: (value: V, key: K) => U): Batch<U, K> {
    const mappedValues = this._values.map((v, i) => {
      const key = this.keyGetter(v, i);
      return fn(v, key);
    });

    // Reuse the original keyGetter on the original values to get keys
    const newKeyGetter = (_: U, i: number) => this.keyGetter(this._values[i], i);

    return new BatchImpl(this.inputKeys, mappedValues, newKeyGetter);
  }

  withInputs(newInputs: K[]): Batch<V, K> {
    return new BatchImpl(newInputs, this._values, this.keyGetter);
  }

  toRecord(): Record<string, V> {
    return this.lazy.read.recordOfValues;
  }

  toRecordWithDefaults(getDefault: (key: K) => V): Record<string, V> {
    const record = { ...this.lazy.read.recordOfValues };
    for (const input of this.lazy.read.unresolvableInputs) {
      record[toKeyString(input)] = getDefault(input);
    }
    return record;
  }
}

// ============================================================================
// Batch Static Companion
// ============================================================================

/** Builder returned by Batch.buildFrom() */
export interface BatchBuilder<V> {
  /** Specify how to extract the key from each value */
  withKey<K extends KeyableType>(keyGetter: (value: V) => K): Batch<V, K>;
}

export const Batch = StaticTypeCompanion({
  /**
   * Start building a batch from a list of values.
   *
   * @example
   * const batch = Batch.buildFrom(users).withKey(user => user.id);
   */
  buildFrom<V>(values: V[]): BatchBuilder<V> {
    return {
      withKey<K extends KeyableType>(keyGetter: (value: V) => K): Batch<V, K> {
        const keys = values.map(keyGetter);
        return new BatchImpl(keys, values, keyGetter);
      },
    };
  },

  /**
   * Create a batch from items that have a specific key property.
   *
   * @example
   * const batch = Batch.fromList(users, "id");
   */
  fromList<V, P extends keyof V>(
    values: V[],
    keyProp: P
  ): Batch<V, V[P] extends KeyableType ? V[P] : never> {
    type K = V[P] extends KeyableType ? V[P] : never;
    const keyGetter = (v: V) => v[keyProp] as K;
    const keys = values.map(keyGetter);
    return new BatchImpl(keys, values, keyGetter) as Batch<V, K>;
  },

  /**
   * Create a batch from items that have an 'id' property.
   *
   * @example
   * const batch = Batch.byId(users);  // users must have .id
   */
  byId<ID extends string, V extends { id: ID }>(values: V[]): Batch<V, ID> {
    return Batch.fromList(values, "id") as Batch<V, ID>;
  },

  /**
   * Create a batch from a record (object with string keys).
   *
   * @example
   * const batch = Batch.fromRecord({ a: 1, b: 2, c: 3 });
   */
  fromRecord<K extends string, V>(record: Record<K, V>): Batch<V, K> {
    const entries = Object.entries(record) as [K, V][];
    const keys = entries.map(([k]) => k);
    const values = entries.map(([, v]) => v);
    const keyGetter = (_: V, i: number) => keys[i];
    return new BatchImpl(keys, values, keyGetter);
  },

  /**
   * Create a batch from key-value entries.
   *
   * @example
   * const batch = Batch.fromEntries([
   *   { key: "a", value: 1 },
   *   { key: "b", value: 2 },
   * ]);
   */
  fromEntries<K extends KeyableType, V>(
    entries: Array<{ key: K; value: V }>
  ): Batch<V, K> {
    const keys = entries.map((e) => e.key);
    const values = entries.map((e) => e.value);
    const keyGetter = (_: V, i: number) => keys[i];
    return new BatchImpl(keys, values, keyGetter);
  },

  /**
   * Create an empty batch.
   */
  empty<V, K extends KeyableType = string>(): Batch<V, K> {
    return new BatchImpl<V, K>([], [], () => {
      throw ErrBatchEmptyDeriveKey.create({});
    });
  },
});
