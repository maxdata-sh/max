/**
 * Context - Type-safe context definitions for connectors.
 *
 * Contexts use standard class syntax with type descriptor initializers.
 *
 * @example
 * class AcmeAppContext extends Context {
 *   api = Context.instance<AcmeApiClient>();
 *   installationId = Context.string;
 * }
 *
 * // Build an instance
 * const ctx = Context.build(AcmeAppContext, {
 *   api: new AcmeApiClient(),
 *   installationId: "inst_123",
 * });
 *
 * // Use in loaders
 * Loader.entity({
 *   context: AcmeAppContext,
 *   load(ref, ctx, deps) {
 *     ctx.api  // ✅ Typed as AcmeApiClient
 *   }
 * })
 */

// ============================================================================
// Type Descriptors
// ============================================================================

import {ClassOf} from "./type-system-utils.js";
import {ErrContextBuildFailed} from "./errors/errors.js";

/**
 * Base interface for type descriptors.
 */
export interface TypeDescBase {
  readonly kind: string;
}

/**
 * Instance type descriptor - for injected dependencies.
 */
export interface InstanceTypeDesc<T> extends TypeDescBase {
  readonly kind: "instance";
  readonly _phantom?: T;
}

/**
 * String type descriptor.
 */
export interface StringTypeDesc extends TypeDescBase {
  readonly kind: "string";
}

/**
 * Number type descriptor.
 */
export interface NumberTypeDesc extends TypeDescBase {
  readonly kind: "number";
}

/**
 * Boolean type descriptor.
 */
export interface BooleanTypeDesc extends TypeDescBase {
  readonly kind: "boolean";
}

/**
 * Any type descriptor.
 */
export type TypeDesc =
  | InstanceTypeDesc<any>
  | StringTypeDesc
  | NumberTypeDesc
  | BooleanTypeDesc;

/**
 * Check if a value is a type descriptor.
 */
function isTypeDesc(value: unknown): value is TypeDesc {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as any).kind === "string"
  );
}

// ============================================================================
// Type Descriptor Factories
// ============================================================================

/**
 * Type descriptor factory functions.
 */
export const t = {
  /**
   * Instance type - for injected dependencies.
   */
  instance<T>(): T {
    return { kind: "instance" } as T;
  },

  /**
   * String type.
   */
  string: { kind: "string" } as unknown as string,

  /**
   * Number type.
   */
  number: { kind: "number" } as unknown as number,

  /**
   * Boolean type.
   */
  boolean: { kind: "boolean" } as unknown as boolean,
} as const;

// ============================================================================
// Context Base Class
// ============================================================================

/**
 * Context - Base class for connector contexts.
 *
 * Subclass and define fields using type descriptors.
 * Use Context.build() to create instances.
 *
 * @example
 * class MyContext extends Context {
 *   api = Context.instance<MyApiClient>();
 *   setting = Context.string;
 * }
 */
export class Context {
  private static buildInProgress = false;

  /**
   * Protected constructor prevents direct instantiation.
   * Must use Context.build() to create instances.
   */
  protected constructor() {
    if (!Context.buildInProgress) {
      throw ErrContextBuildFailed.create({}, "Cannot instantiate Context directly — use Context.build(ContextClass, values)");
    }
  }

  // --- Type descriptor factories (static) ---

  static instance = t.instance;
  static string = t.string;
  static number = t.number;
  static boolean = t.boolean;

  // --- Build method ---

  /**
   * Build a context instance, replacing descriptors with actual values.
   *
   * Validates:
   * - All class fields are type descriptors
   * - All required fields are provided
   *
   * @example
   * const ctx = Context.build(AcmeAppContext, {
   *   api: new AcmeApiClient(),
   *   installationId: "inst_123",
   * });
   */
  static build<C extends Context>(
    ContextClass: ClassOf<C>,
    values: ContextValues<C>
  ): C {
    // Create temporary instance to extract schema
    Context.buildInProgress = true;
    // @ts-ignore protected constructor
    const schemaInstance = new ContextClass();
    Context.buildInProgress = false;

    // Extract schema and validate all fields are type descriptors
    const fieldNames: string[] = [];

    for (const key of Object.keys(schemaInstance)) {
      const value = (schemaInstance as any)[key];

      // Validate: all fields must be type descriptors
      if (!isTypeDesc(value)) {
        throw ErrContextBuildFailed.create({}, `field '${key}' in ${ContextClass} is not a valid type descriptor — use Context.string, Context.instance<T>(), etc.`);
      }

      fieldNames.push(key);
    }

    // Validate: all required fields are provided
    for (const fieldName of fieldNames) {
      if (!(fieldName in values)) {
        throw ErrContextBuildFailed.create({}, `missing required field '${fieldName}' when building ${ContextClass}`);
      }
    }

    // Create final instance with actual values
    Context.buildInProgress = true;
    // @ts-ignore protected constructor
    const instance = new ContextClass();
    Context.buildInProgress = false;

    // Replace descriptors with actual values
    for (const [key, value] of Object.entries(values)) {
      (instance as any)[key] = value;
    }

    return instance;
  }

  /**
   * Extract the runtime schema from a context class.
   */
  static schemaOf<C extends Context>(ContextClass: new () => C): Record<string, TypeDesc> {
    Context.buildInProgress = true;
    const instance = new ContextClass();
    Context.buildInProgress = false;

    const schema: Record<string, TypeDesc> = {};

    for (const key of Object.keys(instance)) {
      const value = (instance as any)[key];
      if (isTypeDesc(value)) {
        schema[key] = value;
      }
    }

    return schema;
  }
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract the value type from a context class.
 * Filters out methods, only includes data fields.
 */
export type ContextValues<C extends Context> = {
  [K in keyof C as C[K] extends Function ? never : K]: C[K];
};

/**
 * Type alias for context classes (for use in generics).
 */
export type ContextClass = typeof Context;

// ============================================================================
// Legacy exports for compatibility
// ============================================================================

export type ContextSchema = Record<string, TypeDesc>;
export type ContextDefAny = Context;
export type InferContext<C extends Context> = ContextValues<C>
