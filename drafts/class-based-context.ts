/**
 * Prototype: Class-based Context Pattern
 *
 * Fields are initialized with type descriptors that provide both:
 * - Runtime schema information
 * - Compile-time type information
 */

// ============================================================================
// Type Descriptors
// ============================================================================

interface TypeDesc {
  readonly kind: string;
}

interface InstanceTypeDesc<T> extends TypeDesc {
  readonly kind: "instance";
  readonly _phantom?: T;
}

interface StringTypeDesc extends TypeDesc {
  readonly kind: "string";
}

interface NumberTypeDesc extends TypeDesc {
  readonly kind: "number";
}

interface BooleanTypeDesc extends TypeDesc {
  readonly kind: "boolean";
}

// ============================================================================
// Context Base Class
// ============================================================================

class Context {
  /**
   * Type descriptor factories that return both:
   * - Runtime descriptor object
   * - Compile-time type T
   */
  static instance<T>(): T {
    return { kind: "instance" } as T;
  }

  static readonly string: string = { kind: "string" } as string;
  static readonly number: number = { kind: "number" } as number;
  static readonly boolean: boolean = { kind: "boolean" } as boolean;

  /**
   * Build an instance of a context class, replacing descriptors with values.
   */
  static build<C extends Context>(
    ContextClass: new () => C,
    values: ContextValues<C>
  ): C {
    // Create instance (will have descriptors as field values)
    const instance = new ContextClass();

    // Replace descriptors with actual values
    for (const [key, value] of Object.entries(values)) {
      (instance as any)[key] = value;
    }

    return instance;
  }

  /**
   * Extract runtime schema from a context class.
   */
  static schemaOf<C extends Context>(ContextClass: new () => C): ContextSchema<C> {
    const instance = new ContextClass();
    const schema: Record<string, TypeDesc> = {};

    for (const key of Object.keys(instance)) {
      const value = (instance as any)[key];
      if (isTypeDesc(value)) {
        schema[key] = value;
      }
    }

    return schema as ContextSchema<C>;
  }
}

// Helper: check if value is a type descriptor
function isTypeDesc(value: unknown): value is TypeDesc {
  return typeof value === "object" && value !== null && "kind" in value;
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract the value types from a context class.
 */
type ContextValues<C extends Context> = {
  [K in keyof C as C[K] extends Function ? never : K]: C[K];
};

/**
 * Extract the schema from a context class.
 */
type ContextSchema<C extends Context> = {
  [K in keyof C as C[K] extends Function ? never : K]: TypeDesc;
};

// ============================================================================
// Example: Define a Context
// ============================================================================

interface AcmeApiClient {
  users: {
    get(id: string): Promise<{ id: string; name: string }>;
  };
}

class AcmeAppContext extends Context {
  api = Context.instance<AcmeApiClient>();
  installationId = Context.string;
}

// ============================================================================
// Usage
// ============================================================================

// Build an instance
const appContext = Context.build(AcmeAppContext, {
  api: { users: { get: async (id) => ({ id, name: "test" }) } },
  installationId: "inst_123",
});

// appContext has type: AcmeAppContext
appContext.api;              // AcmeApiClient
appContext.installationId;   // string

// Pass as a value to loaders
// (This is where it gets interesting - what do we pass?)

// Option A: Pass the class
function useContext1(CtxClass: typeof AcmeAppContext) {
  // CtxClass is the class, not an instance
  // Would need to build it: Context.build(CtxClass, {...})
}

// Option B: Pass an instance
function useContext2(ctx: AcmeAppContext) {
  ctx.api.users.get("u1");  // ✅ Works
}

// ============================================================================
// Type Checking
// ============================================================================

// TypeScript correctly types the fields
const _test1: AcmeApiClient = appContext.api;  // ✅ Works
const _test2: string = appContext.installationId;  // ✅ Works

// @ts-expect-error - foo doesn't exist
const _test3 = appContext.foo;

// Type extraction works
type Values = ContextValues<AcmeAppContext>;
// ^? { api: AcmeApiClient, installationId: string }

// ============================================================================
// The Challenge: Passing Context to Loaders
// ============================================================================

/*
 * QUESTION: What does the loader reference?
 *
 * Option 1: Reference the class
 * --------------------------------
 * Loader.entity({
 *   context: AcmeAppContext,  // The class
 *   load(ref, ctx, deps) {
 *     // ctx has type... AcmeAppContext (the class)? Or the values?
 *   }
 * })
 *
 * Problem: We want ctx to be the VALUES, but we're passing the CLASS.
 * We'd need: InferContext<typeof AcmeAppContext> to get the values.
 * This brings back the verbose types in generics.
 *
 *
 * Option 2: Reference an instance
 * --------------------------------
 * const appCtxInstance = Context.build(AcmeAppContext, {...});
 *
 * Loader.entity({
 *   context: appCtxInstance,  // An instance
 *   load(ref, ctx, deps) {
 *     // ctx has type AcmeAppContext
 *   }
 * })
 *
 * Problem: We need the instance at loader DEFINITION time, but the instance
 * is created at RUNTIME. Chicken and egg.
 *
 *
 * Option 3: Hybrid - pass class, infer values
 * --------------------------------------------
 * Loader.entity({
 *   context: AcmeAppContext,
 *   load(ref, ctx: AcmeAppContext, deps) {
 *     // Explicit annotation: ctx is AcmeAppContext (clean!)
 *     ctx.api.users.get(ref.id);
 *   }
 * })
 *
 * The ctx type is explicitly AcmeAppContext, which TypeScript sees as the
 * instance type with api: AcmeApiClient, etc.
 *
 * This works because TypeScript understands class types as instance types.
 */

// ============================================================================
// Comparison with Class Expression Pattern
// ============================================================================

/*
 * Class Expression Pattern:
 * -------------------------
 * const AcmeAppContext = new class AcmeAppContext extends ContextDef.define({
 *   api: t.instance<AcmeApiClient>(),
 * }) {};
 *
 * ✅ One line definition
 * ✅ AcmeAppContext is both type and value (instance)
 * ❌ Weird syntax
 *
 *
 * Class-Based Pattern:
 * --------------------
 * class AcmeAppContext extends Context {
 *   static schema = { api: t.instance<AcmeApiClient>() };
 *   declare api: AcmeApiClient;
 * }
 *
 * ✅ Standard syntax
 * ✅ Clear field declarations
 * ❌ More lines
 * ❌ Duplicate field names (schema + declare)
 * ⚠️  Need to figure out value vs class passing
 */
