/**
 * SqliteSyncQueryEngine - SQLite-backed SyncQueryEngine.
 *
 * Uses JOINs between entity tables and _max_sync_meta for efficient
 * stale/unloaded ref queries at the database level.
 */

import type { Database } from "bun:sqlite";
import { Page, Ref } from "@max/core";
import type { EntityDefAny, PageRequest, Duration, LoaderName } from "@max/core";
import type { SyncQueryEngine } from "@max/execution";
import type { SqliteSchema } from "@max/storage-sqlite";

// ============================================================================
// SqliteSyncQueryEngine
// ============================================================================

export class SqliteSyncQueryEngine implements SyncQueryEngine {
  constructor(
    private db: Database,
    private schema: SqliteSchema,
  ) {}

  async staleRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    maxAge: Duration,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>> {
    const tableDef = this.schema.getTable(entity);
    const entityType = entity.name;
    const cutoff = Date.now() - (maxAge as number);
    const limit = page?.limit ?? 100;
    const offset = page?.cursor ? parseInt(page.cursor, 10) : 0;

    const rows = this.db
      .query(
        `SELECT e.id FROM ${tableDef.tableName} e
         WHERE NOT EXISTS (
           SELECT 1 FROM _max_sync_meta sm
           WHERE sm.ref_key = 'local:' || ? || ':' || e.id
             AND sm.field = ?
             AND sm.synced_at >= ?
         )
         LIMIT ? OFFSET ?`,
      )
      .all(entityType, loaderName, cutoff, limit + 1, offset) as { id: string }[];

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const refs = items.map((r) => Ref.local(entity, r.id as any) as Ref<E>);
    const cursor = hasMore ? String(offset + limit) : undefined;

    return Page.from(refs, hasMore, cursor);
  }

  async unloadedRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>> {
    const tableDef = this.schema.getTable(entity);
    const entityType = entity.name;
    const limit = page?.limit ?? 100;
    const offset = page?.cursor ? parseInt(page.cursor, 10) : 0;

    const rows = this.db
      .query(
        `SELECT e.id FROM ${tableDef.tableName} e
         WHERE NOT EXISTS (
           SELECT 1 FROM _max_sync_meta sm
           WHERE sm.ref_key = 'local:' || ? || ':' || e.id
             AND sm.field = ?
         )
         LIMIT ? OFFSET ?`,
      )
      .all(entityType, loaderName, limit + 1, offset) as { id: string }[];

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const refs = items.map((r) => Ref.local(entity, r.id as any) as Ref<E>);
    const cursor = hasMore ? String(offset + limit) : undefined;

    return Page.from(refs, hasMore, cursor);
  }
}
