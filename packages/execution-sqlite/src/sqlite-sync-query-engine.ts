/**
 * SqliteSyncQueryEngine - SQLite-backed SyncQueryEngine.
 *
 * Uses JOINs between entity tables and _max_sync_meta for efficient
 * stale/unloaded ref queries at the database level.
 */

import type { Database } from "bun:sqlite";
import { Page, PageRequest, Ref } from "@max/core";
import type { EntityDefAny, Duration, LoaderName } from "@max/core";
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
    const r = PageRequest.from(page).defaultLimit(100);
    const offset = r.parseAsNumericOffset(0);

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
      .all(entityType, loaderName, cutoff, r.fetchSize, offset) as { id: string }[];

    const refs = rows.map((r) => Ref.local(entity, r.id as any) as Ref<E>);
    return Page.fromOffset(refs, offset, r.limit);
  }

  async unloadedRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    page?: PageRequest,
  ): Promise<Page<Ref<E>>> {
    const tableDef = this.schema.getTable(entity);
    const entityType = entity.name;
    const r = PageRequest.from(page).defaultLimit(100);
    const offset = r.parseAsNumericOffset(0);

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
      .all(entityType, loaderName, r.fetchSize, offset) as { id: string }[];

    const refs = rows.map((r) => Ref.local(entity, r.id as any) as Ref<E>);
    return Page.fromOffset(refs, offset, r.limit);
  }
}
