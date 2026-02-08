/**
 * Seeder - Cold-start bootstrapper for sync.
 *
 * Creates root entities and returns a SyncPlan describing how to populate them.
 * The executor holds resolvers; the seeder only needs the engine and context.
 *
 * @example
 * const AcmeSeeder = Seeder.create({
 *   context: AcmeAppContext,
 *   async seed(ctx, engine) {
 *     const rootRef = AcmeRoot.ref("root");
 *     await engine.store(EntityInput.create(rootRef, {}));
 *     return SyncPlan.create([
 *       Step.forRoot(rootRef).loadCollection("users"),
 *       Step.forAll(AcmeUser).loadFields("name", "email"),
 *     ]);
 *   },
 * });
 */

import {StaticTypeCompanion} from "./companion.js";
import type {ContextDefAny, InferContext} from "./context-def.js";
import type {Engine} from "./engine.js";
import type {SyncPlan} from "./sync-plan.js";
import {ClassOf} from "./type-system-utils.js";

// ============================================================================
// Seeder Interface
// ============================================================================

export interface Seeder<TContext extends ContextDefAny = ContextDefAny> {
  /** Context class required by this seeder */
  readonly context: ClassOf<TContext>;

  /** Create root entities and return a sync plan */
  seed(ctx: InferContext<TContext>, engine: Engine): Promise<SyncPlan>;
}

/** Any seeder */
export type SeederAny = Seeder<ContextDefAny>;

// ============================================================================
// Seeder Implementation (internal)
// ============================================================================

/**
 * To prevent infinite type recursion, we internally block context inference.
 * Type inference continues to be applied at the interface level.
 */
type InferContextUnknown<C extends ContextDefAny> = unknown;

class SeederImpl<TContext extends ContextDefAny> implements Seeder<TContext> {
  constructor(
    readonly context: ClassOf<TContext>,
    private seedFn: (
      ctx: InferContextUnknown<TContext>,
      engine: Engine,
    ) => Promise<SyncPlan>,
  ) {}

  seed(
    ctx: InferContextUnknown<TContext>,
    engine: Engine,
  ): Promise<SyncPlan> {
    return this.seedFn(ctx, engine);
  }
}

// ============================================================================
// Seeder Static Companion
// ============================================================================

export const Seeder = StaticTypeCompanion({
  create<TContext extends ContextDefAny>(config: {
    context: ClassOf<TContext>;
    seed: (ctx: InferContext<TContext>, engine: Engine) => Promise<SyncPlan>;
  }): Seeder<TContext> {
    return new SeederImpl(
      config.context,
      config.seed as (ctx: InferContextUnknown<TContext>, engine: Engine) => Promise<SyncPlan>,
    );
  },
});
