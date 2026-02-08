/**
 * SqliteSyncMeta - SQLite-backed implementation of SyncMeta.
 *
 * Persists per-field sync timestamps in the _max_sync_meta table.
 */

import type { Database } from "bun:sqlite";
import type { SyncMeta, Duration, RefAny } from "@max/core";

// ============================================================================
// SqliteSyncMeta
// ============================================================================

export class SqliteSyncMeta implements SyncMeta {
  constructor(private db: Database) {}

  async recordFieldSync(ref: RefAny, fields: string[], timestamp: Date): Promise<void> {
    const refKey = ref.toKey() as string;
    const epochMs = timestamp.getTime();

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO _max_sync_meta (ref_key, field, synced_at) VALUES (?, ?, ?)`,
    );

    this.db.transaction(() => {
      for (const field of fields) {
        stmt.run(refKey, field, epochMs);
      }
    })();
  }

  async getFieldSyncTime(ref: RefAny, field: string): Promise<Date | null> {
    const refKey = ref.toKey() as string;

    const row = this.db
      .query(`SELECT synced_at FROM _max_sync_meta WHERE ref_key = ? AND field = ?`)
      .get(refKey, field) as { synced_at: number } | null;

    return row ? new Date(row.synced_at) : null;
  }

  async staleFields(ref: RefAny, fields: string[], maxAge: Duration): Promise<string[]> {
    const refKey = ref.toKey() as string;
    const cutoff = Date.now() - (maxAge as number);

    if (fields.length === 0) return [];

    // Query for fields that are non-stale (exist and synced recently enough)
    const placeholders = fields.map(() => "?").join(", ");
    const freshRows = this.db
      .query(
        `SELECT field FROM _max_sync_meta
         WHERE ref_key = ? AND field IN (${placeholders}) AND synced_at >= ?`,
      )
      .all(refKey, ...fields, cutoff) as { field: string }[];

    const freshSet = new Set(freshRows.map((r) => r.field));

    // Return fields NOT in the fresh set
    return fields.filter((f) => !freshSet.has(f));
  }

  async invalidateFields(ref: RefAny, fields?: string[]): Promise<void> {
    const refKey = ref.toKey() as string;

    if (!fields) {
      this.db.run(`DELETE FROM _max_sync_meta WHERE ref_key = ?`, [refKey]);
    } else {
      const placeholders = fields.map(() => "?").join(", ");
      this.db.run(
        `DELETE FROM _max_sync_meta WHERE ref_key = ? AND field IN (${placeholders})`,
        [refKey, ...fields],
      );
    }
  }

  async isFullySynced(ref: RefAny, fields: string[], maxAge: Duration): Promise<boolean> {
    const stale = await this.staleFields(ref, fields, maxAge);
    return stale.length === 0;
  }
}
