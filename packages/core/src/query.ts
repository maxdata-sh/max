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

import type {EntityDefAny} from "./entity-def.js";
import type { EntityFields, EntityFieldsKeys } from './field-types.js'
import {StaticTypeCompanion} from "./companion.js";
import {FieldsSelect} from "./fields-selector.js";

// ============================================================================
// Projection discriminators
// ============================================================================

export type RefsProjection = { readonly kind: "refs" };
export type SelectProjection<E extends EntityDefAny, K extends EntityFieldsKeys<E>> = {
  readonly kind: "select";
  readonly fields: K[];
};
export type AllProjection = { readonly kind: "all" };

export type Projection<E extends EntityDefAny = EntityDefAny> =
  | RefsProjection
  | SelectProjection<E, EntityFieldsKeys<E>>
  | AllProjection;

// ============================================================================
// Query descriptor — pure data, serializable
// ============================================================================

export interface EntityQuery<
  E extends EntityDefAny,
  P extends Projection = Projection,
> {
  readonly def: E;
  readonly filters: WhereClause;
  readonly ordering?: QueryOrdering;
  readonly limit?: number;
  readonly cursor?: string;
  readonly projection: P;
}

export type EntityQueryAny = EntityQuery<EntityDefAny>;

export type QueryFilter = {
  readonly field: string;
  readonly op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains";
  readonly value: unknown;
};

/** Recursive filter tree - AND/OR grouping over leaf comparisons. */
export type WhereClause =
  | QueryFilter
  | { readonly kind: 'and'; readonly clauses: WhereClause[] }
  | { readonly kind: 'or';  readonly clauses: WhereClause[] }

/** Type + companion for WhereClause. */
export const WhereClause = StaticTypeCompanion({
  /** Create an AND group. */
  and(...clauses: WhereClause[]): WhereClause {
    return { kind: 'and', clauses }
  },
  /** Create an OR group. */
  or(...clauses: WhereClause[]): WhereClause {
    return { kind: 'or', clauses }
  },
  /** Type guard: is this a leaf QueryFilter (not an and/or node)? */
  isLeaf(w: WhereClause): w is QueryFilter {
    return !('kind' in w)
  },
  /** Empty where clause (matches everything). */
  empty: { kind: 'and', clauses: [] } as WhereClause,
})

export type QueryOrdering = {
  readonly field: string;
  readonly dir: "asc" | "desc";
};

// ============================================================================
// Query builder — fluent accumulator, produces EntityQuery
// ============================================================================

export interface QueryBuilder<E extends EntityDefAny> {
  where<K extends EntityFieldsKeys<E>>(
    field: K,
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains",
    value: EntityFields<E>[K],
  ): QueryBuilder<E>;

  limit(n: number): QueryBuilder<E>;
  after(cursor: string): QueryBuilder<E>;
  orderBy<K extends EntityFieldsKeys<E>>(
    field: K,
    dir?: "asc" | "desc",
  ): QueryBuilder<E>;

  // Terminal methods — finalize into EntityQuery
  refs(): EntityQuery<E, RefsProjection>;
  select<K extends EntityFieldsKeys<E>>(
    ...fields: K[]
  ): EntityQuery<E, SelectProjection<E,K>>;
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
  private _cursor?: string;

  constructor(private _def: E) {}

  where<K extends EntityFieldsKeys<E>>(
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

  after(cursor: string): QueryBuilder<E> {
    this._cursor = cursor;
    return this;
  }

  orderBy<K extends EntityFieldsKeys<E>>(
    field: K,
    dir: "asc" | "desc" = "asc",
  ): QueryBuilder<E> {
    this._ordering = { field: field as string, dir };
    return this;
  }

  refs(): EntityQuery<E, RefsProjection> {
    return this.build({ kind: "refs" });
  }

  select<K extends EntityFieldsKeys<E>>(
    ...fields: K[]
  ): EntityQuery<E, SelectProjection<E,K>> {
    return this.build({ kind: "select", fields: fields });
  }

  selectAll(): EntityQuery<E, AllProjection> {
    return this.build({ kind: "all" });
  }

  private build<P extends Projection>(projection: P): EntityQuery<E, P> {
    return {
      def: this._def,
      filters: WhereClause.and(...this._filters),
      ordering: this._ordering,
      limit: this._limit,
      cursor: this._cursor,
      projection,
    };
  }
}

// ============================================================================
// Projection constants
// ============================================================================

export const Projection = StaticTypeCompanion({
  refs: { kind: 'refs' } as RefsProjection,
  all: { kind: 'all' } as AllProjection,
  select<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    ...fields: K[]
  ): FieldsSelect<E, K> {
    return { kind: 'select', fields }
  },
})

// ============================================================================
// Query companion object (entry point)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Query = StaticTypeCompanion({
  from<E extends EntityDefAny>(def: E): QueryBuilder<E> {
    return new QueryBuilderImpl(def);
  },
});
