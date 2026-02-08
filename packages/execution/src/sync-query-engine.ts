/**
 * SyncQueryEngine - Composed query engine for the sync layer.
 *
 * Wraps Engine + SyncMeta to provide stale-aware queries.
 * Application code uses plain Engine; the sync layer uses this.
 *
 * Keeps sync concerns out of the Engine interface.
 */

import type {EntityDefAny, Page, PageRequest, Ref, Duration, LoaderName} from "@max/core";

// ============================================================================
// SyncQueryEngine Interface
// ============================================================================

export interface SyncQueryEngine {
  /** Get refs that need syncing for a loader (stale or never loaded) */
  staleRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    maxAge: Duration,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>>;

  /** Get refs that have never been loaded by a loader */
  unloadedRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>>;
}
