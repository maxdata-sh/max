/**
 * Pagination types for collection queries.
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

export class PageOf<T> implements Page<T> {
  constructor(
    readonly items: T[],
    readonly hasMore: boolean,
    readonly cursor?: string,
    readonly total?: number
  ) {}

  static empty<T>(): Page<T> {
    return new PageOf([], false);
  }

  static from<T>(items: T[], hasMore: boolean, cursor?: string): Page<T> {
    return new PageOf(items, hasMore, cursor);
  }
}
