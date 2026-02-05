/**
 * Pagination types for collection queries.
 */

import {StaticTypeCompanion} from "./companion.js";

/**
 * Page<T> - A page of results from a paginated query.
 *
 * Create using:
 *   Page.from(items, hasMore, cursor)
 *   Page.empty()
 */
export interface Page<T> {
  readonly items: T[];
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly total?: number;
}

export interface PageRequest {
  cursor?: string;
  limit?: number;
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
}

// ============================================================================
// Page Static Methods (namespace merge)
// ============================================================================

/** Static methods for creating Pages */
export const Page = StaticTypeCompanion({
  /** Create an empty page */
  empty<T>(): Page<T> {
    return new PageImpl([], false);
  },

  /** Create a page from items */
  from<T>(items: T[], hasMore: boolean, cursor?: string, total?: number): Page<T> {
    return new PageImpl(items, hasMore, cursor, total);
  },
})
