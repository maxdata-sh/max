import {AcmeTask} from "@max/connector-acme";
/**
 * Refs and Scopes - Draft v1
 *
 * Exploring how refs work across different scopes.
 *
 * Key requirements:
 * 1. Refs are polymorphic over scope
 * 2. DX optimized for local scope (the common case)
 * 3. Scope boundary crossing requires "upgrading" refs
 * 4. Higher scopes carry additional context (e.g., installationId)
 */

// ============================================================================
// PART 1: Scope Definitions
// ============================================================================

/**
 * Scopes form a hierarchy. Higher scopes contain more context.
 *
 * Local < System < (potentially more)
 *
 * Local: Single engine, single installation. No installation context needed.
 * System: Multiple installations. Refs carry installationId.
 */

interface LocalScope {
  readonly kind: "local";
}

interface SystemScope {
  readonly kind: "system";
  readonly installationId: string;
}

// Future: EnterpriseScope, TenantScope, etc.

type Scope = LocalScope | SystemScope;

const Scope = {
  local(): LocalScope {
    return { kind: "local" };
  },
  system(installationId: string): SystemScope {
    return { kind: "system", installationId };
  },
} as const;

// ============================================================================
// PART 2: Approach A - Scope as Type Parameter with Default
// ============================================================================

/**
 * Ref<E, S> where S defaults to LocalScope.
 *
 * Pros:
 * - Type parameter makes scope explicit when needed
 * - Default means most code just writes Ref<E>
 * - Can constrain functions to specific scopes
 *
 * Cons:
 * - Two type parameters might feel heavy
 * - Converting between scopes requires new type
 */

namespace ApproachA {
  interface Ref<E extends EntityDefAny, S extends Scope = LocalScope> {
    readonly entityDef: E;
    readonly entityType: string;
    readonly id: string;
    readonly scope: S;
  }

  // Convenience aliases
  type LocalRef<E extends EntityDefAny> = Ref<E, LocalScope>;
  type SystemRef<E extends EntityDefAny> = Ref<E, SystemScope>;

  // Any ref (any entity, any scope)
  type RefAny = Ref<EntityDefAny, Scope>;

  // Usage examples:
  declare const localRef: Ref<AcmeTask>;  // implicitly LocalScope
  declare const systemRef: Ref<AcmeTask, SystemScope>;

  // Function that only accepts local refs
  declare function processLocal<E extends EntityDefAny>(ref: LocalRef<E>): void;

  // Function that accepts any scope
  declare function processAny<E extends EntityDefAny, S extends Scope>(ref: Ref<E, S>): void;

  // Upgrade from local to system
  function upgrade<E extends EntityDefAny>(
    ref: LocalRef<E>,
    installationId: string
  ): SystemRef<E> {
    return {
      ...ref,
      scope: Scope.system(installationId),
    };
  }
}

// ============================================================================
// PART 3: Approach B - Scope Embedded in Ref, Types for Constraints
// ============================================================================

/**
 * Single Ref type with scope as a property.
 * Use type predicates/guards for narrowing.
 *
 * Pros:
 * - Simpler single type
 * - Runtime scope checking easy
 *
 * Cons:
 * - Less type-level guarantees
 * - Need type guards everywhere
 */

namespace ApproachB {
  interface Ref<E extends EntityDefAny = EntityDefAny> {
    readonly entityDef: E;
    readonly entityType: string;
    readonly id: string;
    readonly scope: Scope;
  }

  // Type guards
  function isLocal<E extends EntityDefAny>(ref: Ref<E>): ref is Ref<E> & { scope: LocalScope } {
    return ref.scope.kind === "local";
  }

  function isSystem<E extends EntityDefAny>(ref: Ref<E>): ref is Ref<E> & { scope: SystemScope } {
    return ref.scope.kind === "system";
  }

  // Upgrade
  function upgrade<E extends EntityDefAny>(
    ref: Ref<E>,
    installationId: string
  ): Ref<E> {
    if (ref.scope.kind === "system") {
      return ref; // Already system scope
    }
    return {
      ...ref,
      scope: Scope.system(installationId),
    };
  }
}

// ============================================================================
// PART 4: Approach C - Branded/Phantom Types
// ============================================================================

/**
 * Use brands to tag refs with their scope without changing runtime.
 *
 * Pros:
 * - Zero runtime overhead for scope tracking
 * - Clean separation of concerns
 *
 * Cons:
 * - Brands can be confusing
 * - Need explicit cast for upgrade
 */

namespace ApproachC {
  declare const LocalBrand: unique symbol;
  declare const SystemBrand: unique symbol;

  interface RefBase<E extends EntityDefAny> {
    readonly entityDef: E;
    readonly entityType: string;
    readonly id: string;
  }

  type LocalRef<E extends EntityDefAny> = RefBase<E> & { [LocalBrand]: true };
  type SystemRef<E extends EntityDefAny> = RefBase<E> & {
    [SystemBrand]: true;
    readonly installationId: string;
  };

  type Ref<E extends EntityDefAny> = LocalRef<E> | SystemRef<E>;



  // Upgrade adds installationId and changes brand
  function upgrade<E extends EntityDefAny>(
    ref: LocalRef<E>,
    installationId: string
  ): SystemRef<E> {
    return {
      ...ref,
      installationId,
    } as SystemRef<E>;
  }

  const x: Ref<AcmeTask> = null


}

// ============================================================================
// PART 5: EntityResult Upgrade
// ============================================================================

/**
 * When crossing scope boundaries, we need to upgrade not just a ref,
 * but an entire EntityResult including all its ref fields.
 */

namespace EntityResultUpgrade {
  // Assuming Approach A style refs

  interface EntityResult<
    E extends EntityDefAny,
    S extends Scope,
    Loaded extends keyof EntityFields<E>
  > {
    readonly ref: Ref<E, S>;
    readonly fields: FieldsProxy<E, S, Loaded>;
  }

  // Fields proxy where ref fields are scoped
  type FieldsProxy<
    E extends EntityDefAny,
    S extends Scope,
    Loaded extends keyof EntityFields<E>
  > = {
    readonly [K in Loaded]: ScopedFieldType<E["fields"][K], S>;
  };

  // Map field types, scoping refs appropriately
  type ScopedFieldType<F extends FieldDef, S extends Scope> =
    F extends ScalarField<"string"> ? string :
    F extends ScalarField<"number"> ? number :
    F extends ScalarField<"boolean"> ? boolean :
    F extends ScalarField<"date"> ? Date :
    F extends RefField<infer T> ? Ref<T, S> :
    F extends CollectionField<infer T> ? Ref<T, S>[] :
    never;

  // Upgrade function for EntityResult
  function upgradeResult<
    E extends EntityDefAny,
    Loaded extends keyof EntityFields<E>
  >(
    result: EntityResult<E, LocalScope, Loaded>,
    installationId: string
  ): EntityResult<E, SystemScope, Loaded> {
    // Implementation would walk fields and upgrade any refs
    throw new Error("TODO");
  }
}

// ============================================================================
// PART 6: Engine Scoping
// ============================================================================

/**
 * Engines operate at a specific scope.
 * A LocalEngine returns LocalRefs.
 * A SystemEngine returns SystemRefs.
 */

namespace EngineScoping {
  // Engine is parameterized by scope
  interface Engine<S extends Scope> {
    load<E extends EntityDefAny>(
      ref: Ref<E, S>,
      fields: FieldsAll
    ): Promise<EntityResult<E, S, keyof EntityFields<E>>>;

    store<E extends EntityDefAny>(
      input: EntityInput<E, S>
    ): Promise<Ref<E, S>>;
  }

  type LocalEngine = Engine<LocalScope>;
  type SystemEngine = Engine<SystemScope>;

  // Router engine at system scope delegates to local engines
  class RouterEngine implements SystemEngine {
    private engines: Map<string, LocalEngine> = new Map();

    async load<E extends EntityDefAny>(
      ref: Ref<E, SystemScope>,
      fields: FieldsAll
    ): Promise<EntityResult<E, SystemScope, keyof EntityFields<E>>> {
      const installationId = ref.scope.installationId;
      const localEngine = this.engines.get(installationId);
      if (!localEngine) throw new Error(`No engine for ${installationId}`);

      // Downgrade ref to local scope
      const localRef = downgrade(ref);

      // Get local result
      const localResult = await localEngine.load(localRef, fields);

      // Upgrade result to system scope
      return upgradeResult(localResult, installationId);
    }

    async store<E extends EntityDefAny>(
      input: EntityInput<E, SystemScope>
    ): Promise<Ref<E, SystemScope>> {
      // Similar: downgrade input, delegate, upgrade result
      throw new Error("TODO");
    }
  }

  function downgrade<E extends EntityDefAny>(
    ref: Ref<E, SystemScope>
  ): Ref<E, LocalScope> {
    return {
      ...ref,
      scope: Scope.local(),
    };
  }

  function upgradeResult<E extends EntityDefAny, Loaded extends keyof EntityFields<E>>(
    result: EntityResult<E, LocalScope, Loaded>,
    installationId: string
  ): EntityResult<E, SystemScope, Loaded> {
    throw new Error("TODO");
  }
}

// ============================================================================
// PART 7: DX Considerations
// ============================================================================

/**
 * For the common case (local scope), we want minimal ceremony:
 *
 *   const ref = SlackChannel.ref("C123");     // LocalRef inferred
 *   const result = engine.load(ref, Fields.ALL);
 *   result.fields.creator;                     // Also LocalRef
 *
 * Scope only becomes explicit at boundaries:
 *
 *   const systemRef = upgradeRef(ref, installationId);
 *   systemEngine.load(systemRef, Fields.ALL);
 *
 * Question: Should EntityDef.ref() take an optional scope?
 *
 *   SlackChannel.ref("C123");                  // Local by default
 *   SlackChannel.ref("C123", Scope.system("inst-123"));  // Explicit system
 *
 * Or separate methods?
 *
 *   SlackChannel.ref("C123");                  // Local
 *   SlackChannel.systemRef("C123", "inst-123"); // System
 */

// ============================================================================
// PLACEHOLDER TYPES (for compilation)
// ============================================================================

interface EntityDefAny {
  name: string;
  fields: Record<string, FieldDef>;
}

interface FieldDef {
  kind: string;
}

interface ScalarField<T extends string> extends FieldDef {
  kind: "scalar";
  type: T;
}

interface RefField<T extends EntityDefAny> extends FieldDef {
  kind: "ref";
  target: T;
}

interface CollectionField<T extends EntityDefAny> extends FieldDef {
  kind: "collection";
  target: T;
}

type EntityFields<E extends EntityDefAny> = {
  [K in keyof E["fields"]]: unknown;
};

interface FieldsAll {
  kind: "all";
}

interface Ref<E extends EntityDefAny, S extends Scope = LocalScope> {
  entityDef: E;
  entityType: string;
  id: string;
  scope: S;
}

interface EntityResult<E extends EntityDefAny, S extends Scope, Loaded> {
  ref: Ref<E, S>;
}

interface EntityInput<E extends EntityDefAny, S extends Scope> {
  ref: Ref<E, S>;
}


// ============================================================================
// QUESTIONS TO RESOLVE
// ============================================================================

/**
 * 1. Which approach (A, B, or C) feels right?
 *    - A gives strongest type guarantees
 *    - B is simpler but less safe
 *    - C is clever but might be confusing
 *
 * 2. How does scope affect EntityInput?
 *    - When storing at system scope, do ref fields need to be system-scoped?
 *    - Or do we accept local refs and upgrade them?
 *
 * 3. Should there be a "scope-agnostic" ref type for code that doesn't care?
 *    - `Ref<E>` meaning "any scope"
 *    - `Ref<E, LocalScope>` meaning "definitely local"
 *
 * 4. How do we handle collections that span installations?
 *    - A system-level query might return refs from multiple installations
 *    - Each ref needs its own installationId
 *
 * 5. Naming: Is "Scope" the right name?
 *    - Alternatives: Level, Layer, Context, Realm, Zone
 */
