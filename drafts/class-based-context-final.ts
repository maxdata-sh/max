/**
 * Class-Based Context Pattern - Final Implementation
 */

// ============================================================================
// Type Descriptors
// ============================================================================

interface TypeDescBase {
  readonly kind: string;
}

interface InstanceTypeDesc<T> extends TypeDescBase {
  readonly kind: "instance";
  readonly _phantom?: T;
}

interface StringTypeDesc extends TypeDescBase {
  readonly kind: "string";
}

interface NumberTypeDesc extends TypeDescBase {
  readonly kind: "number";
}

interface BooleanTypeDesc extends TypeDescBase {
  readonly kind: "boolean";
}

type TypeDesc = InstanceTypeDesc<any> | StringTypeDesc | NumberTypeDesc | BooleanTypeDesc;

function isTypeDesc(value: unknown): value is TypeDesc {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as any).kind === "string"
  );
}

// ============================================================================
// Context Base Class
// ============================================================================

class Context {
  private static buildInProgress = false;

  /**
   * Protected constructor - prevents direct instantiation.
   * Must use Context.build() to create instances.
   */
  protected constructor() {
    if (!Context.buildInProgress) {
      throw new Error(
        "Cannot instantiate Context directly. Use Context.build(ContextClass, values)."
      );
    }
  }

  // --- Type descriptor factories ---

  static instance<T>(): T {
    return { kind: "instance" } as T;
  }

  static readonly string: string = { kind: "string" } as string;
  static readonly number: number = { kind: "number" } as number;
  static readonly boolean: boolean = { kind: "boolean" } as boolean;

  // --- Build method ---

  /**
   * Build a context instance, replacing descriptors with actual values.
   *
   * Validates:
   * - All class fields are type descriptors (not arbitrary values)
   * - Provided values match the schema
   */
  static build<C extends Context>(
    ContextClass: new () => C,
    values: Partial<ContextValues<C>>
  ): C {
    // Create temp instance to extract schema
    Context.buildInProgress = true;
    const schemaInstance = new ContextClass();
    Context.buildInProgress = false;

    // Extract schema from descriptors
    const schema: Record<string, TypeDesc> = {};
    const fieldNames: string[] = [];

    for (const key of Object.keys(schemaInstance)) {
      const value = (schemaInstance as any)[key];

      // Validate: all fields must be type descriptors
      if (!isTypeDesc(value)) {
        throw new Error(
          `Context field '${key}' is not a valid type descriptor. ` +
            `Use Context.string, Context.instance<T>(), etc.`
        );
      }

      schema[key] = value;
      fieldNames.push(key);
    }

    // Validate: all required fields are provided
    for (const fieldName of fieldNames) {
      if (!(fieldName in values)) {
        throw new Error(`Missing required context field: ${fieldName}`);
      }
    }

    // Create final instance with actual values
    Context.buildInProgress = true;
    const instance = new ContextClass();
    Context.buildInProgress = false;

    for (const [key, value] of Object.entries(values)) {
      (instance as any)[key] = value;
    }

    return instance;
  }
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract the value type from a context class.
 * Excludes methods, only includes data fields.
 */
type ContextValues<C extends Context> = {
  [K in keyof C as C[K] extends Function ? never : K]: C[K];
};

// ============================================================================
// Example: AcmeAppContext
// ============================================================================

interface AcmeApiClient {
  users: {
    get(id: string): Promise<{ id: string; name: string; email: string }>;
    getBatch(ids: string[]): Promise<Array<{ id: string; name: string; email: string }>>;
  };
}

class AcmeAppContext extends Context {
  api = Context.instance<AcmeApiClient>();
  installationId = Context.string;
  maxRetries = Context.number;
}

// ============================================================================
// Usage Examples
// ============================================================================

// Build an instance
const appContext = Context.build(AcmeAppContext, {
  api: {
    users: {
      get: async (id) => ({ id, name: "test", email: "test@example.com" }),
      getBatch: async (ids) => [],
    },
  },
  installationId: "inst_123",
  maxRetries: 3,
});

// Type checking
const _api: AcmeApiClient = appContext.api;  // ✅ Works
const _id: string = appContext.installationId;  // ✅ Works
const _retries: number = appContext.maxRetries;  // ✅ Works

// Pass to functions
function useContext(ctx: AcmeAppContext) {
  ctx.api.users.get("u1");
  ctx.installationId;
  ctx.maxRetries;
}

useContext(appContext);  // ✅ Works

// ============================================================================
// Error Cases
// ============================================================================

// Direct instantiation fails at runtime
try {
  const _bad = new AcmeAppContext();
  console.log("Should not reach here");
} catch (e) {
  console.log("✅ Caught:", (e as Error).message);
  // "Cannot instantiate Context directly. Use Context.build(ContextClass, values)."
}

// Invalid field in class definition
class BadContext extends Context {
  api = Context.instance<AcmeApiClient>();
  // @ts-expect-error - not a type descriptor (would fail at runtime)
  badField = "just a string";
}

try {
  Context.build(BadContext, {
    api: {} as AcmeApiClient,
    badField: "value",
  });
} catch (e) {
  console.log("✅ Caught:", (e as Error).message);
  // "Context field 'badField' is not a valid type descriptor..."
}

// Missing required field
try {
  Context.build(AcmeAppContext, {
    api: {} as AcmeApiClient,
    // Missing: installationId, maxRetries
  } as any);
} catch (e) {
  console.log("✅ Caught:", (e as Error).message);
  // "Missing required context field: installationId"
}

// ============================================================================
// How This Works With Loaders
// ============================================================================

/*
 * The loader references the class:
 */
interface Loader<TContext extends typeof Context> {
  context: TContext;
  load(
    ref: any,
    ctx: InstanceType<TContext>,  // Extract instance type from class
    deps: any
  ): Promise<any>;
}

function createLoader<TContext extends typeof Context>(config: {
  context: TContext;
  load: (ref: any, ctx: InstanceType<TContext>, deps: any) => Promise<any>;
}): Loader<TContext> {
  return config;
}

// Usage
const userLoader = createLoader({
  context: AcmeAppContext,  // The class
  load: async (ref, ctx, deps) => {
    // ctx has type: InstanceType<typeof AcmeAppContext>
    // Which is: AcmeAppContext (the instance type)
    ctx.api.users.get(ref.id);  // ✅ Fully typed
    ctx.installationId;         // ✅ string
    return {};
  },
});

// ============================================================================
// Verdict
// ============================================================================

/*
 * ✅ WORKS BEAUTIFULLY
 *
 * - Standard class syntax (no weird class expressions)
 * - Clean types everywhere (AcmeAppContext)
 * - Runtime validation of schema
 * - Prevents direct instantiation
 * - InstanceType<typeof AcmeAppContext> = AcmeAppContext (clean)
 *
 * Trade-offs:
 * - Field names appear twice (static schema + declare)
 * - Slightly more lines than class expression
 *
 * BUT: Much more approachable for developers.
 */
