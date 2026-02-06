/**
 * SyncPlan - Declarative, non-async description of sync steps.
 *
 * A SyncPlan is pure data describing what to sync, not how to sync it.
 * The executor interprets plans into tasks at runtime.
 *
 * @example
 * const plan = SyncPlan.create([
 *   Step.forRoot(rootRef).loadCollection("users"),
 *   Step.forAll(AcmeUser).loadFields("name", "email"),
 *   Step.concurrent([
 *     Step.forAll(AcmeTeam).loadCollection("members"),
 *     Step.forAll(AcmeProject).loadFields("name", "status"),
 *   ]),
 * ]);
 */

import {StaticTypeCompanion} from "./companion.js";
import type {EntityDefAny} from "./entity-def.js";
import type {CollectionKeys, NonCollectionKeys} from "./field-types.js";
import type {RefAny, Ref} from "./ref.js";

// ============================================================================
// Step Targets
// ============================================================================

/** Target all entities of a type in Max's store (paginated internally) */
export interface ForAllTarget {
  readonly kind: "forAll";
  readonly entity: EntityDefAny;
}

/** Target a specific root entity */
export interface ForRootTarget {
  readonly kind: "forRoot";
  readonly ref: RefAny;
}

/** Target a specific entity */
export interface ForOneTarget {
  readonly kind: "forOne";
  readonly ref: RefAny;
}

export type StepTarget = ForAllTarget | ForRootTarget | ForOneTarget;

// ============================================================================
// Step Operations
// ============================================================================

/** Load scalar/ref fields via resolvers */
export interface LoadFieldsOperation {
  readonly kind: "loadFields";
  readonly fields: readonly string[];
}

/** Load a collection field from upstream */
export interface LoadCollectionOperation {
  readonly kind: "loadCollection";
  readonly field: string;
}

export type StepOperation = LoadFieldsOperation | LoadCollectionOperation;

// ============================================================================
// SyncStep - A resolved target + operation pair
// ============================================================================

export interface SyncStep {
  readonly target: StepTarget;
  readonly operation: StepOperation;
}

// ============================================================================
// ConcurrentSteps - Steps that can run in parallel
// ============================================================================

export interface ConcurrentSteps {
  readonly kind: "concurrent";
  readonly steps: readonly SyncStep[];
}

// ============================================================================
// SyncPlanEntry - Either a single step or concurrent group
// ============================================================================

export type SyncPlanEntry = SyncStep | ConcurrentSteps;

// ============================================================================
// SyncPlan
// ============================================================================

/**
 * SyncPlan - An ordered list of sync steps.
 *
 * Steps are sequential by default. Use Step.concurrent() for parallel execution.
 */
export interface SyncPlan {
  readonly steps: readonly SyncPlanEntry[];
}

export const SyncPlan = StaticTypeCompanion({
  create(steps: SyncPlanEntry[]): SyncPlan {
    return { steps };
  },
});

// ============================================================================
// StepBuilder - Type-safe builder for creating SyncSteps
// ============================================================================

class StepBuilder<E extends EntityDefAny> {
  constructor(private readonly target: StepTarget) {}

  /** Load scalar/ref fields via resolvers (type-checked against entity) */
  loadFields<K extends NonCollectionKeys<E>>(...fields: [K, ...K[]]): SyncStep {
    return {
      target: this.target,
      operation: { kind: "loadFields", fields: fields as string[] },
    };
  }

  /** Load a collection field from upstream (type-checked against entity) */
  loadCollection<K extends CollectionKeys<E>>(field: K): SyncStep {
    return {
      target: this.target,
      operation: { kind: "loadCollection", field: field as string },
    };
  }
}

// ============================================================================
// Step Static Companion
// ============================================================================

/** Static methods for creating sync steps */
export const Step = StaticTypeCompanion({
  /** Target all entities of a type in Max's store */
  forAll<E extends EntityDefAny>(entity: E): StepBuilder<E> {
    return new StepBuilder<E>({ kind: "forAll", entity });
  },

  /** Target a specific root entity */
  forRoot<E extends EntityDefAny>(ref: Ref<E>): StepBuilder<E> {
    return new StepBuilder<E>({ kind: "forRoot", ref });
  },

  /** Target a specific entity */
  forOne<E extends EntityDefAny>(ref: Ref<E>): StepBuilder<E> {
    return new StepBuilder<E>({ kind: "forOne", ref });
  },

  /** Run steps concurrently */
  concurrent(steps: SyncStep[]): ConcurrentSteps {
    return { kind: "concurrent", steps };
  },
});
