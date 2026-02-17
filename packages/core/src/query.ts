/**
 * Query - decoupled query descriptor and fluent builder.
 *
 * The builder is a pure library mechanism that produces a serializable
 * EntityQuery descriptor. The descriptor is then passed to an Engine
 * for execution.
 *
 * @example
 * const q = Query.from(AcmeUser)
 *   .where("active", "=", true)
 *   .orderBy("displayName")
 *   .limit(10)
 *   .select("displayName", "email")
 *
 * const page = await engine.query(q)
 */

import type { EntityDefAny } from "./entity-def.js";
import type { EntityFields } from "./field-types.js";
import { StaticTypeCompanion } from "./companion.js";

// ============================================================================
// Projection discriminators
// ============================================================================

export type RefsProjection = { readonly kind: "refs" };
export type SelectProjection<K extends string = string> = {
  readonly kind: "select";
  readonly fields: K[];
};
export type AllProjection = { readonly kind: "all" };
export type Projection = RefsProjection | SelectProjection | AllProjection;

// ============================================================================
// Query descriptor — pure data, serializable
// ============================================================================

export interface EntityQuery<
  E extends EntityDefAny,
  P extends Projection = Projection,
> {
  readonly def: E;
  readonly filters: QueryFilter[];
  readonly ordering?: QueryOrdering;
  readonly limit?: number;
  readonly offset?: number;
  readonly projection: P;
}

export type EntityQueryAny = EntityQuery<EntityDefAny>;

export type QueryFilter = {
  readonly field: string;
  readonly op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains";
  readonly value: unknown;
};

export type QueryOrdering = {
  readonly field: string;
  readonly dir: "asc" | "desc";
};

// ============================================================================
// Query builder — fluent accumulator, produces EntityQuery
// ============================================================================

export interface QueryBuilder<E extends EntityDefAny> {
  where<K extends keyof EntityFields<E>>(
    field: K,
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains",
    value: EntityFields<E>[K],
  ): QueryBuilder<E>;

  limit(n: number): QueryBuilder<E>;
  offset(n: number): QueryBuilder<E>;
  orderBy<K extends keyof EntityFields<E>>(
    field: K,
    dir?: "asc" | "desc",
  ): QueryBuilder<E>;

  // Terminal methods — finalize into EntityQuery
  refs(): EntityQuery<E, RefsProjection>;
  select<K extends keyof EntityFields<E>>(
    ...fields: K[]
  ): EntityQuery<E, SelectProjection<K & string>>;
  selectAll(): EntityQuery<E, AllProjection>;
}

export type QueryBuilderAny = QueryBuilder<EntityDefAny>;

// ============================================================================
// Builder implementation (internal)
// ============================================================================

class QueryBuilderImpl<E extends EntityDefAny> implements QueryBuilder<E> {
  private _filters: QueryFilter[] = [];
  private _ordering?: QueryOrdering;
  private _limit?: number;
  private _offset?: number;

  constructor(private _def: E) {}

  where<K extends keyof EntityFields<E>>(
    field: K,
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains",
    value: EntityFields<E>[K],
  ): QueryBuilder<E> {
    this._filters.push({ field: field as string, op, value });
    return this;
  }

  limit(n: number): QueryBuilder<E> {
    this._limit = n;
    return this;
  }

  offset(n: number): QueryBuilder<E> {
    this._offset = n;
    return this;
  }

  orderBy<K extends keyof EntityFields<E>>(
    field: K,
    dir: "asc" | "desc" = "asc",
  ): QueryBuilder<E> {
    this._ordering = { field: field as string, dir };
    return this;
  }

  refs(): EntityQuery<E, RefsProjection> {
    return this.build({ kind: "refs" });
  }

  select<K extends keyof EntityFields<E>>(
    ...fields: K[]
  ): EntityQuery<E, SelectProjection<K & string>> {
    return this.build({ kind: "select", fields: fields as (K & string)[] });
  }

  selectAll(): EntityQuery<E, AllProjection> {
    return this.build({ kind: "all" });
  }

  private build<P extends Projection>(projection: P): EntityQuery<E, P> {
    return {
      def: this._def,
      filters: [...this._filters],
      ordering: this._ordering,
      limit: this._limit,
      offset: this._offset,
      projection,
    };
  }
}

// ============================================================================
// Projection constants
// ============================================================================

export const Projection = StaticTypeCompanion({
  refs: { kind: "refs" } as RefsProjection,
  all: { kind: "all" } as AllProjection,
  select<K extends string>(...fields: K[]): SelectProjection<K> {
    return { kind: "select", fields };
  },
});

// ============================================================================
// Query companion object (entry point)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Query = StaticTypeCompanion({
  from<E extends EntityDefAny>(def: E): QueryBuilder<E> {
    return new QueryBuilderImpl(def);
  },
});
