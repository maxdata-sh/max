/**
 * SqliteExecutionSchema - Creates execution layer tables in SQLite.
 *
 * Tables are prefixed with _max_ to avoid collisions with entity tables.
 */

import type { Database } from "bun:sqlite";

// ============================================================================
// SqliteExecutionSchema
// ============================================================================

export class SqliteExecutionSchema {
  /** Create the execution tables and indexes */
  static ensureTables(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS _max_tasks (
        id            TEXT PRIMARY KEY,
        sync_id       TEXT NOT NULL,
        state         TEXT NOT NULL,
        payload       TEXT NOT NULL,
        parent_id     TEXT,
        blocked_by    TEXT,
        not_before    INTEGER,
        created_at    INTEGER NOT NULL,
        completed_at  INTEGER,
        error         TEXT
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_claim ON _max_tasks (sync_id, state, not_before)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_parent ON _max_tasks (parent_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_blocked ON _max_tasks (blocked_by, state)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS _max_sync_meta (
        ref_key     TEXT NOT NULL,
        field       TEXT NOT NULL,
        synced_at   INTEGER NOT NULL,
        PRIMARY KEY (ref_key, field)
      )
    `);
  }
}
