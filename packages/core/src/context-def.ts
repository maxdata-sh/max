/**
 * ContextDef - Type-safe connector context definitions.
 *
 * Follows the Type + Companion Object pattern.
 * Connectors define their context shape, and loaders reference it for type safety.
 *
 * @example
 * const AcmeContext = ContextDef.create({
 *   api: t.instance<AcmeApiClient>(),
 *   installationId: t.string(),
 * });
 *
 * // AcmeContext is both a type and a value
 * type Ctx = ContextDef.Infer<typeof AcmeContext>;  // { api: AcmeApiClient, installationId: string }
 */

import { StaticTypeCompanion } from "./companion.js";

// ============================================================================
// Type Descriptors
// ============================================================================

/**
 * Type descriptors for context fields.
 * These carry type information at the type level.
 */
export interface StringTypeDesc {
  readonly kind: "string";
}

export interface NumberTypeDesc {
  readonly kind: "number";
}

export interface BooleanTypeDesc {
  readonly kind: "boolean";
}

export interface InstanceTypeDesc<T> {
  readonly kind: "instance";
  // Phantom type - not used at runtime, but carries T at type level
  readonly _phantom?: T;
}

export interface OptionalTypeDesc<T extends TypeDesc> {
  readonly kind: "optional";
  readonly inner: T;
}

export type TypeDesc =
  | StringTypeDesc
  | NumberTypeDesc
  | BooleanTypeDesc
  | InstanceTypeDesc<unknown>
  | OptionalTypeDesc<TypeDesc>;

/**
 * Type descriptor factories.
 */
export const t = {
  string: (): StringTypeDesc => ({ kind: "string" }),
  number: (): NumberTypeDesc => ({ kind: "number" }),
  boolean: (): BooleanTypeDesc => ({ kind: "boolean" }),
  instance: <T>(): InstanceTypeDesc<T> => ({ kind: "instance" }),
  optional: <T extends TypeDesc>(inner: T): OptionalTypeDesc<T> => ({ kind: "optional", inner }),
} as const;

// ============================================================================
// Type Inference
// ============================================================================

/**
 * Infer the TypeScript type from a type descriptor.
 */
export type InferTypeDesc<T extends TypeDesc> =
  T extends StringTypeDesc ? string :
  T extends NumberTypeDesc ? number :
  T extends BooleanTypeDesc ? boolean :
  T extends InstanceTypeDesc<infer U> ? U :
  T extends OptionalTypeDesc<infer U> ? InferTypeDesc<U> | undefined :
  never;

/**
 * Schema for context definition - mapping of field names to type descriptors.
 */
export type ContextSchema = Record<string, TypeDesc>;

/**
 * Infer the full context type from a schema.
 */
export type InferContextSchema<S extends ContextSchema> = {
  readonly [K in keyof S]: InferTypeDesc<S[K]>;
};

// ============================================================================
// ContextDef Interface
// ============================================================================

/**
 * ContextDef<S> - A context definition with schema S.
 *
 * Use ContextDef.create() to create one.
 */
export interface ContextDef<S extends ContextSchema = ContextSchema> {
  readonly schema: S;

  /**
   * Create a context instance from values.
   */
  create(values: InferContextSchema<S>): InferContextSchema<S>;
}

export type ContextDefAny = ContextDef<ContextSchema>;

/**
 * Infer the context type from a ContextDef.
 */
export type InferContext<C extends ContextDefAny> =
  C extends ContextDef<infer S> ? InferContextSchema<S> : never;

// ============================================================================
// ContextDef Implementation
// ============================================================================

class ContextDefImpl<S extends ContextSchema> implements ContextDef<S> {
  constructor(readonly schema: S) {}

  create(values: InferContextSchema<S>): InferContextSchema<S> {
    // For now, just return as-is. Could add validation later.
    return values;
  }
}

// ============================================================================
// ContextDef Static Companion
// ============================================================================

export const ContextDef = StaticTypeCompanion({
  /**
   * Create a new context definition.
   *
   * @example
   * const AcmeContext = ContextDef.create({
   *   api: t.instance<AcmeApiClient>(),
   *   installationId: t.string(),
   * });
   */
  create<S extends ContextSchema>(schema: S): ContextDef<S> {
    return new ContextDefImpl(schema);
  },
});

// ============================================================================
// Namespace for type utilities
// ============================================================================

export namespace ContextDef {
  /**
   * Infer the context type from a ContextDef.
   *
   * @example
   * type Ctx = ContextDef.Infer<typeof AcmeContext>;
   */
  export type Infer<C extends ContextDefAny> = InferContext<C>;
}
