import {
  createVirginStateFile,
  createStateFile,
  readStateFile,
  updateStateFile,
  deleteStateFile,
  hashQueryParams,
  resolveStatePath,
  type QueryParams,
  type PaginationState,
} from './pagination-state.js';

/**
 * Result of advancing a pagination session.
 */
export interface PaginationAdvanceResult {
  /** Whether there are more results to fetch */
  hasMore: boolean;
  /** The stderr hint message to display, if any */
  hint: string | null;
  /** The state reference to use for continuation */
  stateRef: string | null;
}

/**
 * Orchestrates pagination workflow across search operations.
 *
 * This class provides a clean abstraction over the low-level state file
 * operations, handling:
 * - Loading/creating state files
 * - Validating query params match
 * - Advancing offset after search
 * - Generating stderr hint messages
 * - Determining completion status
 */
export class PaginationSession {
  private constructor(
    private configDir: string,
    private stateRef: string,
    private resolvedPath: string,
    private state: PaginationState,
    private queryParams: QueryParams,
  ) {}

  /**
   * Resume an existing pagination session from a state reference.
   * Validates that query params match (or locks them in for virgin state).
   *
   * @throws Error if state file not found or query params don't match
   */
  static resume(
    configDir: string,
    stateRef: string,
    queryParams: QueryParams,
  ): PaginationSession {
    const resolvedPath = resolveStatePath(configDir, stateRef);
    const state = readStateFile(resolvedPath);

    if (!state) {
      throw new Error(`State file not found: ${stateRef}`);
    }

    const queryHash = hashQueryParams(queryParams);

    if (state.queryHash === null) {
      // Virgin state - lock in the query hash on first use
      state.queryHash = queryHash;
      state.source = queryParams.source;
      // Persist the lock-in immediately
      updateStateFile(resolvedPath, {
        queryHash,
        source: queryParams.source,
      });
    } else if (queryHash !== state.queryHash) {
      throw new Error(`Query params don't match state file. Use a new state or match the original query.`);
    }

    return new PaginationSession(configDir, stateRef, resolvedPath, state, queryParams);
  }

  /**
   * Get the current offset to use for the search query.
   */
  get currentOffset(): number {
    return this.state.offset;
  }

  /**
   * Check if pagination is already exhausted (offset >= total).
   */
  get isExhausted(): boolean {
    return this.state.total !== null && this.state.offset >= this.state.total;
  }

  /**
   * Get pagination info for exhausted state (for empty result output).
   */
  getExhaustedPagination(limit: number): { offset: number; limit: number; total: number; hasMore: false } | null {
    if (!this.isExhausted || this.state.total === null) {
      return null;
    }
    return {
      offset: this.state.offset,
      limit,
      total: this.state.total,
      hasMore: false,
    };
  }

  /**
   * Advance the session after a search completes.
   * Updates the state file and returns the hint message.
   *
   * @param total Total number of results available
   * @param fetchedCount Number of results fetched in this batch
   */
  advance(total: number, fetchedCount: number): PaginationAdvanceResult {
    const nextOffset = this.state.offset + fetchedCount;
    const hasMore = nextOffset < total;

    // Update the state file
    updateStateFile(this.resolvedPath, {
      offset: nextOffset,
      total,
      hasMore,
      source: this.queryParams.source,
      queryHash: this.state.queryHash,
    });

    // Update local state
    this.state.offset = nextOffset;
    this.state.total = total;
    this.state.hasMore = hasMore;

    if (hasMore) {
      return {
        hasMore: true,
        hint: `More results (${nextOffset} of ${total}). Continue: --state=${this.stateRef}`,
        stateRef: this.stateRef,
      };
    } else {
      return {
        hasMore: false,
        hint: `Complete (${total} results).`,
        stateRef: this.stateRef,
      };
    }
  }

  /**
   * Create a virgin state file for pre-initialized pagination.
   * Returns the state reference.
   */
  static createVirgin(configDir: string): string {
    return createVirginStateFile(configDir);
  }

  /**
   * Create a new pagination session JIT (just-in-time) when more results exist.
   * Returns null if pagination is complete (no more results).
   *
   * Use this when no --state was provided but results indicate more data exists.
   *
   * @param configDir The .max directory path
   * @param queryParams Query parameters for this search
   * @param total Total results available
   * @param fetchedCount Results fetched so far (used as next offset)
   */
  static createIfNeeded(
    configDir: string,
    queryParams: QueryParams,
    total: number,
    fetchedCount: number,
  ): PaginationAdvanceResult | null {
    const hasMore = fetchedCount < total;

    if (!hasMore) {
      return null;
    }

    const stateRef = createStateFile(configDir, queryParams, total, fetchedCount);

    return {
      hasMore: true,
      hint: `More results (${fetchedCount} of ${total}). Continue: --state=${stateRef}`,
      stateRef,
    };
  }

  /**
   * Delete a state file by reference.
   */
  static delete(configDir: string, stateRef: string): void {
    deleteStateFile(configDir, stateRef);
  }
}

/**
 * Handle pagination state for a search operation.
 *
 * This is the main entry point for pagination in search commands.
 * It encapsulates the complete pagination workflow:
 * - If --state provided: resumes existing session
 * - After search: advances state or creates JIT state file
 * - Generates appropriate stderr hints
 *
 * @returns Object with session (if resuming), offset to use, and advance function
 */
export function createPaginationHandler(
  configDir: string,
  stateRef: string | undefined,
  queryParams: QueryParams,
  defaultOffset: number,
): {
  /** The pagination session if resuming, null otherwise */
  session: PaginationSession | null;
  /** The offset to use for the search query */
  offset: number;
  /** Whether pagination is already exhausted (should skip search) */
  isExhausted: boolean;
  /** Get pagination info for exhausted state */
  getExhaustedPagination: (limit: number) => { offset: number; limit: number; total: number; hasMore: false } | null;
  /**
   * Call after search to update state and get hint.
   * @param total Total results available (from pagination metadata)
   * @param fetchedCount Results fetched in this batch
   * @returns The hint message to write to stderr, or null
   */
  advance: (total: number, fetchedCount: number) => string | null;
} {
  if (stateRef) {
    const session = PaginationSession.resume(configDir, stateRef, queryParams);
    return {
      session,
      offset: session.currentOffset,
      isExhausted: session.isExhausted,
      getExhaustedPagination: (limit) => session.getExhaustedPagination(limit),
      advance: (total, fetchedCount) => {
        const result = session.advance(total, fetchedCount);
        return result.hint;
      },
    };
  }

  return {
    session: null,
    offset: defaultOffset,
    isExhausted: false,
    getExhaustedPagination: () => null,
    advance: (total, fetchedCount) => {
      const result = PaginationSession.createIfNeeded(configDir, queryParams, total, fetchedCount);
      return result?.hint ?? null;
    },
  };
}
