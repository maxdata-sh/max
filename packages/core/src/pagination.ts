/**
 * Pagination utilities for collection queries.
 *
 * Page<T> - Result container with cursor and transformation support.
 * PageRequest - Smart request object with limit defaulting and cursor parsing.
 *
 * @example
 * // Offset-based API
 * const r = req.defaultLimit(100);
 * const offset = r.offset(0);
 * const results = await api.getUsers(offset, r.fetchSize);
 * return Page.fromOffset(results, offset, r.limit);
 *
 * @example
 * // Token-based API
 * const r = req.defaultLimit(50);
 * const { nodes, nextToken } = await api.getIssues(r.cursor, r.limit);
 * return Page.fromNext(nodes, nextToken);
 */

import { StaticTypeCompanion } from "./companion.js";

// ============================================================================
// Page Interface
// ============================================================================

/**
 * Page<T> - A page of results from a paginated query.
 *
 * T = Item type
 *
 * Create using static methods:
 *   Page.from(items, hasMore, cursor)
 *   Page.fromOffset(items, offset, limit)
 *   Page.fromNext(items, nextToken)
 *   Page.empty()
 */
export interface Page<T> {
  readonly items: T[];
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly total?: number;

  /** Transform items while preserving cursor, hasMore, and total */
  map<U>(fn: (item: T) => U): Page<U>;
}

// ============================================================================
// Page Implementation (internal)
// ============================================================================

class PageImpl<T> implements Page<T> {
  constructor(
    readonly items: T[],
    readonly hasMore: boolean,
    readonly cursor?: string,
    readonly total?: number
  ) {}

  map<U>(fn: (item: T) => U): Page<U> {
    return new PageImpl(this.items.map(fn), this.hasMore, this.cursor, this.total);
  }
}

// ============================================================================
// Page Static Methods (namespace merge)
// ============================================================================

export const Page = StaticTypeCompanion({
  /** Create an empty page */
  empty<T>(): Page<T> {
    return new PageImpl([], false);
  },

  /** Create a page from items */
  from<T>(
    items: T[],
    hasMore: boolean,
    cursor?: string,
    total?: number
  ): Page<T> {
    return new PageImpl(items, hasMore, cursor, total);
  },

  /**
   * Create a page from offset-based results.
   *
   * Encapsulates the "request one more" pattern:
   * - Caller fetches `limit + 1` items (via `resolved.fetchSize`)
   * - If result has more than `limit` items, hasMore=true and items are trimmed
   * - Next cursor is `String(offset + limit)`
   *
   * @param items - The results (may include the extra +1 item)
   * @param offset - The offset these results were fetched from
   * @param limit - The page limit (NOT fetchSize)
   */
  fromOffset<T>(items: T[], offset: number, limit: number): Page<T> {
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const cursor = hasMore ? String(offset + limit) : undefined;
    return new PageImpl(pageItems, hasMore, cursor);
  },

  /**
   * Create a page from token-based results.
   *
   * hasMore is derived from whether a next token exists.
   *
   * @param items - The results
   * @param next - The next page token (null/undefined = no more pages)
   */
  fromNext<T>(items: T[], next?: string | null): Page<T> {
    const hasMore = next != null;
    return new PageImpl(items, hasMore, next ?? undefined);
  },

  /**
   * Create a PageRequest to begin pagination.
   *
   * @example
   * api.getUsers(Page.begin(100))
   * api.getUsers(Page.begin())  // no limit preference
   */
  begin(limit?: number): PageRequest {
    return new PageRequestImpl(undefined, limit);
  },
});

// ============================================================================
// PageRequest Interface
// ============================================================================

/**
 * PageRequest - A pagination request with cursor and optional limit.
 *
 * Create using:
 *   Page.begin(limit?)
 *   PageRequest.from({ cursor, limit })
 *   PageRequest.at(cursor, limit?)
 */
export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;

  /**
   * Ensure a limit is set, using `n` as the default if no limit was specified.
   * If a limit was already set by the caller, it is preserved.
   */
  defaultLimit(n: number): ResolvedPageRequest;

  /**
   * Parse the cursor with a custom function, returning defaultValue if no cursor.
   *
   * @example
   * const ts = req.parseCursor(s => new Date(s), new Date(0))
   */
  parseCursor<T>(fn: (cursor: string) => T, defaultValue: T): T;

  /**
   * Parse the cursor as a numeric offset, returning defaultValue if no cursor.
   * Shorthand for `parseCursor(Number, defaultValue)`.
   *
   * @example
   * const offset = req.offset(0)
   */
  offset(defaultValue: number): number;
}

/**
 * A PageRequest with a guaranteed limit.
 * Created by calling `request.defaultLimit(n)`.
 */
export interface ResolvedPageRequest extends PageRequest {
  readonly limit: number;

  /** limit + 1 — the amount to request from the underlying API for the "fetch one more" pattern */
  readonly fetchSize: number;
}

// ============================================================================
// PageRequest Implementation (internal)
// ============================================================================

class PageRequestImpl implements PageRequest {
  constructor(
    readonly cursor: string | undefined,
    readonly limit: number | undefined
  ) {}

  defaultLimit(n: number): ResolvedPageRequest {
    return new ResolvedPageRequestImpl(this.cursor, this.limit ?? n);
  }

  parseCursor<T>(fn: (cursor: string) => T, defaultValue: T): T {
    if (this.cursor == null) return defaultValue;
    return fn(this.cursor);
  }

  offset(defaultValue: number): number {
    return this.parseCursor(Number, defaultValue);
  }
}

class ResolvedPageRequestImpl extends PageRequestImpl implements ResolvedPageRequest {
  declare readonly limit: number;

  constructor(cursor: string | undefined, limit: number) {
    super(cursor, limit);
  }

  get fetchSize(): number {
    return this.limit + 1;
  }
}

// ============================================================================
// PageRequest Static Methods (namespace merge)
// ============================================================================

export const PageRequest = StaticTypeCompanion({
  /** Wrap a plain {cursor, limit} object into a PageRequest */
  from(input?: { cursor?: string; limit?: number }): PageRequest {
    return new PageRequestImpl(input?.cursor, input?.limit);
  },

  /** Create a request starting from the beginning */
  begin(limit?: number): PageRequest {
    return new PageRequestImpl(undefined, limit);
  },

  /** Create a request at a specific cursor */
  at(cursor: string, limit?: number): PageRequest {
    return new PageRequestImpl(cursor, limit);
  },
});
