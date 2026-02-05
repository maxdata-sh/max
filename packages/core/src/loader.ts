/**
 * Loader - Units of execution that fetch data from external APIs.
 *
 * Four loader types:
 * - EntityLoader: Single ref → EntityInput<E>
 * - EntityLoaderBatched: Multiple refs → Batch<EntityInput<E>, Ref<E>>
 * - CollectionLoader: Parent ref → Page<Ref<TTarget>>
 * - RawLoader: No ref → TData (for config, metadata, etc.)
 *
 * @example
 * const UserLoader = Loader.entity({
 *   name: "acme:user:basic",
 *   context: AcmeContext,
 *   entity: AcmeUser,
 *   async load(ref, ctx, deps) {
 *     const user = await ctx.api.users.get(ref.id);
 *     return EntityInput.create(ref, { name: user.name, email: user.email });
 *   }
 * });
 */

import { StaticTypeCompanion } from "./companion.js";
import type { Id } from "./brand.js";
import type { EntityDefAny, EntityDef } from "./entity-def.js";
import type { EntityInput } from "./entity-input.js";
import type { EntityFields } from "./field-types.js";
import type { Ref } from "./ref.js";
import type { Page, PageRequest } from "./pagination.js";
import type { Batch } from "./batch.js";
import type { ContextDef, ContextDefAny, InferContext } from "./context-def.js";

// ============================================================================
// Branded Types
// ============================================================================

/**
 * LoaderName - Soft-branded identifier for loaders.
 */
export type LoaderName = Id<"loader-name">;

// ============================================================================
// Loader Strategy
// ============================================================================

/**
 * LoaderStrategy determines when a loader runs.
 *
 * - "autoload": Runs automatically during sync (default)
 * - "manual": Only runs when explicitly requested
 */
export type LoaderStrategy = "autoload" | "manual";

// ============================================================================
// LoaderResults - Typed access to dependency results
// ============================================================================

/**
 * LoaderResults provides typed access to results from dependency loaders.
 */
export interface LoaderResults {
  /**
   * Get the result of a raw loader, or undefined if not available.
   */
  get<TData>(loader: RawLoader<TData, ContextDefAny>): TData | undefined;

  /**
   * Get the result of a raw loader, or throw if not available.
   */
  getOrThrow<TData>(loader: RawLoader<TData, ContextDefAny>): TData;

  /**
   * Check if a loader's result is available.
   */
  has(loader: LoaderAny): boolean;
}

/**
 * Implementation of LoaderResults.
 */
export class LoaderResultsImpl implements LoaderResults {
  private results = new Map<LoaderAny, unknown>();

  set<T>(loader: LoaderAny, result: T): void {
    this.results.set(loader, result);
  }

  get<TData>(loader: RawLoader<TData, ContextDefAny>): TData | undefined {
    return this.results.get(loader) as TData | undefined;
  }

  getOrThrow<TData>(loader: RawLoader<TData, ContextDefAny>): TData {
    const result = this.get(loader);
    if (result === undefined) {
      throw new Error(`Loader result not available: ${loader.name}`);
    }
    return result;
  }

  has(loader: LoaderAny): boolean {
    return this.results.has(loader);
  }
}

// ============================================================================
// Field Assignment (for Resolver.for syntax)
// ============================================================================

/**
 * FieldAssignment - Returned by loader.field() for use in Resolver.for().
 */
export interface FieldAssignment<E extends EntityDefAny = EntityDefAny> {
  readonly loader: LoaderAny;
  readonly sourceField: string | undefined;
  readonly _entity?: E; // Phantom for type checking
}

// ============================================================================
// Base Loader Interface
// ============================================================================

/**
 * Common properties for all loader types.
 */
export interface BaseLoader<TContext extends ContextDefAny = ContextDefAny> {
  /** Unique name for this loader */
  readonly name: LoaderName;

  /** When to run: "autoload" (default) or "manual" */
  readonly strategy: LoaderStrategy;

  /** Loaders that must run before this one */
  readonly dependsOn: readonly LoaderAny[];

  /** Context definition for type safety */
  readonly context: TContext;

  /**
   * Create a field assignment for use in Resolver.for().
   * @param sourceField - The field name in the loader's output (if different from entity field)
   */
  field(sourceField?: string): FieldAssignment;
}

// ============================================================================
// EntityLoader - Single ref, returns EntityInput
// ============================================================================

/**
 * EntityLoader<E, TContext> - Loads fields for a single entity.
 *
 * Returns EntityInput<E> containing the ref and loaded fields.
 */
export interface EntityLoader<
  E extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny
> extends BaseLoader<TContext> {
  readonly kind: "entity";
  readonly entity: E;

  /**
   * Load fields for a single entity.
   */
  load(
    ref: Ref<E>,
    ctx: InferContext<TContext>,
    deps: LoaderResults
  ): Promise<EntityInput<E>>;
}

// ============================================================================
// EntityLoaderBatched - Multiple refs, returns Batch
// ============================================================================

/**
 * EntityLoaderBatched<E, TContext> - Loads fields for multiple entities.
 *
 * Returns Batch<EntityInput<E>, Ref<E>> for efficient bulk operations.
 */
export interface EntityLoaderBatched<
  E extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny
> extends BaseLoader<TContext> {
  readonly kind: "entityBatched";
  readonly entity: E;

  /**
   * Load fields for multiple entities.
   */
  load(
    refs: readonly Ref<E>[],
    ctx: InferContext<TContext>,
    deps: LoaderResults
  ): Promise<Batch<EntityInput<E>, Ref<E>>>;
}

// ============================================================================
// CollectionLoader - Returns paginated refs
// ============================================================================

/**
 * CollectionLoader<E, TTarget, TContext> - Loads a collection field.
 *
 * Returns Page<Ref<TTarget>> for the collection items.
 */
export interface CollectionLoader<
  E extends EntityDefAny = EntityDefAny,
  TTarget extends EntityDefAny = EntityDefAny,
  TContext extends ContextDefAny = ContextDefAny
> extends BaseLoader<TContext> {
  readonly kind: "collection";
  readonly entity: E;
  readonly target: TTarget;

  /**
   * Load a page of collection items.
   */
  load(
    ref: Ref<E>,
    page: PageRequest,
    ctx: InferContext<TContext>,
    deps: LoaderResults
  ): Promise<Page<Ref<TTarget>>>;
}

// ============================================================================
// RawLoader - Returns arbitrary data
// ============================================================================

/**
 * RawLoader<TData, TContext> - Loads arbitrary data (config, metadata, etc.)
 *
 * Not tied to any entity. Useful for data that other loaders depend on.
 */
export interface RawLoader<
  TData = unknown,
  TContext extends ContextDefAny = ContextDefAny
> extends BaseLoader<TContext> {
  readonly kind: "raw";

  /**
   * Load raw data.
   */
  load(
    ctx: InferContext<TContext>,
    deps: LoaderResults
  ): Promise<TData>;
}

// ============================================================================
// Loader Union Types
// ============================================================================

/**
 * Any loader type for a given context.
 */
export type Loader<TContext extends ContextDefAny = ContextDefAny> =
  | EntityLoader<EntityDefAny, TContext>
  | EntityLoaderBatched<EntityDefAny, TContext>
  | CollectionLoader<EntityDefAny, EntityDefAny, TContext>
  | RawLoader<unknown, TContext>;

/**
 * Any loader type (fully erased).
 */
export type LoaderAny = Loader<ContextDefAny>;

// ============================================================================
// Loader Implementation
// ============================================================================

/**
 * To prevent infinite type recursion, we internally block context inference.
 * Type inference continues to be applied at the interface level.
 * */
type InferContextUnknown<C extends ContextDefAny> = unknown

class EntityLoaderImpl<E extends EntityDefAny, TContext extends ContextDefAny>
  implements EntityLoader<E, TContext>
{
  readonly kind = "entity" as const;

  constructor(
    readonly name: LoaderName,
    readonly context: TContext,
    readonly entity: E,
    readonly strategy: LoaderStrategy,
    readonly dependsOn: readonly LoaderAny[],
    private loadFn: (
      ref: Ref<E>,
      ctx: InferContextUnknown<TContext>,
      deps: LoaderResults
    ) => Promise<EntityInput<E>>
  ) {}

  load(
    ref: Ref<E>,
    ctx: InferContextUnknown<TContext>,
    deps: LoaderResults
  ): Promise<EntityInput<E>> {
    return this.loadFn(ref, ctx as unknown, deps);
  }

  field(sourceField?: string): FieldAssignment<E> {
    return { loader: this, sourceField, _entity: this.entity };
  }
}

class EntityLoaderBatchedImpl<E extends EntityDefAny, TContext extends ContextDefAny>
  implements EntityLoaderBatched<E, TContext>
{
  readonly kind = "entityBatched" as const;

  constructor(
    readonly name: LoaderName,
    readonly context: TContext,
    readonly entity: E,
    readonly strategy: LoaderStrategy,
    readonly dependsOn: readonly LoaderAny[],
    private loadFn: (
      refs: readonly Ref<E>[],
      ctx: InferContextUnknown<TContext>,
      deps: LoaderResults
    ) => Promise<Batch<EntityInput<E>, Ref<E>>>
  ) {}

  load(
    refs: readonly Ref<E>[],
    ctx: InferContextUnknown<TContext>,
    deps: LoaderResults
  ): Promise<Batch<EntityInput<E>, Ref<E>>> {
    return this.loadFn(refs, ctx, deps);
  }

  field(sourceField?: string): FieldAssignment<E> {
    return { loader: this, sourceField, _entity: this.entity };
  }
}

class CollectionLoaderImpl<
  E extends EntityDefAny,
  TTarget extends EntityDefAny,
  TContext extends ContextDefAny
> implements CollectionLoader<E, TTarget, TContext>
{
  readonly kind = "collection" as const;

  constructor(
    readonly name: LoaderName,
    readonly context: TContext,
    readonly entity: E,
    readonly target: TTarget,
    readonly strategy: LoaderStrategy,
    readonly dependsOn: readonly LoaderAny[],
    private loadFn: (
      ref: Ref<E>,
      page: PageRequest,
      ctx: InferContextUnknown<TContext>,
      deps: LoaderResults
    ) => Promise<Page<Ref<TTarget>>>
  ) {}

  load(
    ref: Ref<E>,
    page: PageRequest,
    ctx: InferContextUnknown<TContext>,
    deps: LoaderResults
  ): Promise<Page<Ref<TTarget>>> {
    return this.loadFn(ref, page, ctx, deps);
  }

  field(sourceField?: string): FieldAssignment<E> {
    return { loader: this, sourceField, _entity: this.entity };
  }
}



class RawLoaderImpl<TData, TContext extends ContextDefAny>
  implements RawLoader<TData, TContext>
{
  readonly kind = "raw" as const;

  constructor(
    readonly name: LoaderName,
    readonly context: TContext,
    readonly strategy: LoaderStrategy,
    readonly dependsOn: readonly LoaderAny[],
    private loadFn: (
      ctx: InferContextUnknown<TContext>,
      deps: LoaderResults
    ) => Promise<TData>
  ) {}

  load(ctx: InferContextUnknown<TContext>, deps: LoaderResults): Promise<TData> {
    return this.loadFn(ctx, deps);
  }

  field(sourceField?: string): FieldAssignment {
    return { loader: this, sourceField };
  }
}

// ============================================================================
// Loader Static Companion
// ============================================================================

export const Loader = StaticTypeCompanion({
  /**
   * Create an entity loader (single ref).
   */
  entity<E extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: LoaderName;
    context: TContext;
    entity: E;
    strategy?: LoaderStrategy;
    dependsOn?: readonly LoaderAny[];
    load: (
      ref: Ref<E>,
      ctx: InferContext<TContext>,
      deps: LoaderResults
    ) => Promise<EntityInput<E>>;
  }): EntityLoader<E, TContext> {
    return new EntityLoaderImpl(
      config.name,
      config.context,
      config.entity,
      config.strategy ?? "autoload",
      config.dependsOn ?? [],
      config.load as InferContextUnknown<TContext> as any
    );
  },

  /**
   * Create a batched entity loader (multiple refs).
   */
  entityBatched<E extends EntityDefAny, TContext extends ContextDefAny>(config: {
    name: LoaderName;
    context: TContext;
    entity: E;
    strategy?: LoaderStrategy;
    dependsOn?: readonly LoaderAny[];
    load: (
      refs: readonly Ref<E>[],
      ctx: InferContext<TContext>,
      deps: LoaderResults
    ) => Promise<Batch<EntityInput<E>, Ref<E>>>;
  }): EntityLoaderBatched<E, TContext> {
    return new EntityLoaderBatchedImpl(
      config.name,
      config.context,
      config.entity,
      config.strategy ?? "autoload",
      config.dependsOn ?? [],
      config.load as InferContextUnknown<TContext> as any
    );
  },

  /**
   * Create a collection loader (paginated refs).
   */
  collection<
    E extends EntityDefAny,
    TTarget extends EntityDefAny,
    TContext extends ContextDefAny
  >(config: {
    name: LoaderName;
    context: TContext;
    entity: E;
    target: TTarget;
    strategy?: LoaderStrategy;
    dependsOn?: readonly LoaderAny[];
    load: (
      ref: Ref<E>,
      page: PageRequest,
      ctx: InferContext<TContext>,
      deps: LoaderResults
    ) => Promise<Page<Ref<TTarget>>>;
  }): CollectionLoader<E, TTarget, TContext> {
    return new CollectionLoaderImpl(
      config.name,
      config.context,
      config.entity,
      config.target,
      config.strategy ?? "autoload",
      config.dependsOn ?? [],
      config.load as InferContextUnknown<TContext> as any
    );
  },

  /**
   * Create a raw loader (arbitrary data).
   */
  raw<TData, TContext extends ContextDefAny>(config: {
    name: LoaderName;
    context: TContext;
    strategy?: LoaderStrategy;
    dependsOn?: readonly LoaderAny[];
    load: (
      ctx: InferContext<TContext>,
      deps: LoaderResults
    ) => Promise<TData>;
  }): RawLoader<TData, TContext> {
    return new RawLoaderImpl(
      config.name,
      config.context,
      config.strategy ?? "autoload",
      config.dependsOn ?? [],
      config.load as InferContextUnknown<TContext> as any
    );
  },
});
