/**
 * LocalSyncQueryEngine - SyncQueryEngine implementation for local execution.
 *
 * Composes Engine + SyncMeta to provide stale-aware entity queries.
 * Queries all refs from Engine, then filters by SyncMeta staleness.
 *
 * Future optimisation: use SQLite JOINs for efficient filtering at DB level.
 */

import {Page} from "@max/core";
import type {
  EntityDefAny,
  Ref,
  PageRequest,
  Engine,
  SyncMeta,
  Duration,
  LoaderName,
} from "@max/core";
import type {SyncQueryEngine} from "@max/execution";

// ============================================================================
// LocalSyncQueryEngine
// ============================================================================

export class LocalSyncQueryEngine implements SyncQueryEngine {
  constructor(
    private engine: Engine,
    private syncMeta: SyncMeta,
  ) {}

  async staleRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    maxAge: Duration,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>> {
    // Get all refs from Engine
    const allRefs = await this.engine.query(entity).refs();

    // Filter to stale ones via SyncMeta
    const staleRefs: Ref<E>[] = [];
    for (const ref of allRefs) {
      const fields = [loaderName as string]; // Use loader name as the tracked field
      const stale = await this.syncMeta.staleFields(ref, fields, maxAge);
      if (stale.length > 0) {
        staleRefs.push(ref);
      }
    }

    return this.paginate(staleRefs, page);
  }

  async unloadedRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>> {
    // Get all refs from Engine
    const allRefs = await this.engine.query(entity).refs();

    // Filter to never-loaded ones
    const unloaded: Ref<E>[] = [];
    for (const ref of allRefs) {
      const syncTime = await this.syncMeta.getFieldSyncTime(ref, loaderName as string);
      if (syncTime === null) {
        unloaded.push(ref);
      }
    }

    return this.paginate(unloaded, page);
  }

  private paginate<T>(items: T[], page?: PageRequest): Page<T> {
    const limit = page?.limit ?? items.length;
    const offset = page?.cursor ? parseInt(page.cursor, 10) : 0;
    const slice = items.slice(offset, offset + limit);
    const hasMore = offset + limit < items.length;
    const cursor = hasMore ? String(offset + limit) : undefined;
    return Page.from(slice, hasMore, cursor);
  }
}
