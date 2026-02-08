import type { Database } from "bun:sqlite";
import type { ChangeEvent, EntityType, TaskHistoryEntry } from "./types.ts";

export function appendChange(
  db: Database,
  event: {
    entityType: EntityType;
    entityId: string;
    action: "create" | "update" | "delete";
    payload: Record<string, unknown> | null;
  },
): number {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO changelog (entity_type, entity_id, action, payload, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
  );
  stmt.run(
    event.entityType,
    event.entityId,
    event.action,
    event.payload ? JSON.stringify(event.payload) : null,
    now,
  );
  // last_insert_rowid() gives us the AUTOINCREMENT sequence
  return db.prepare("SELECT last_insert_rowid() as seq").get() as any as number;
}

export function getChanges(
  db: Database,
  since: number = 0,
  limit: number = 100,
): { events: ChangeEvent[]; nextCursor: number } {
  const rows = db
    .prepare(
      `SELECT sequence, entity_type, entity_id, action, payload, timestamp
       FROM changelog WHERE sequence > ? ORDER BY sequence ASC LIMIT ?`,
    )
    .all(since, limit) as any[];

  const events: ChangeEvent[] = rows.map((r) => ({
    sequence: r.sequence,
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    action: r.action,
    payload: r.payload ? JSON.parse(r.payload) : null,
    timestamp: r.timestamp,
  }));

  const nextCursor = events.length > 0 ? events[events.length - 1].sequence : since;
  return { events, nextCursor };
}

export function getLatestCursor(db: Database): number {
  const row = db.prepare("SELECT MAX(sequence) as seq FROM changelog").get() as any;
  return row?.seq ?? 0;
}

export function getRecentChanges(db: Database, limit: number = 50): ChangeEvent[] {
  const rows = db
    .prepare(
      `SELECT sequence, entity_type, entity_id, action, payload, timestamp
       FROM changelog ORDER BY sequence DESC LIMIT ?`,
    )
    .all(limit) as any[];

  return rows.map((r) => ({
    sequence: r.sequence,
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    action: r.action,
    payload: r.payload ? JSON.parse(r.payload) : null,
    timestamp: r.timestamp,
  }));
}

// ---------------------------------------------------------------------------
// Task change history (reverse-chronological)
// ---------------------------------------------------------------------------

export function appendTaskHistory(
  db: Database,
  entry: {
    taskId: string;
    changedById: string;
    changes: Record<string, { before: unknown; after: unknown }>;
  },
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO task_history (task_id, changed_by_id, changed_at, changes)
     VALUES (?, ?, ?, ?)`,
  ).run(entry.taskId, entry.changedById, now, JSON.stringify(entry.changes));
}

export function getTaskHistory(
  db: Database,
  taskId: string,
  opts: { before?: number; limit?: number } = {},
): { entries: TaskHistoryEntry[]; nextCursor: number | null } {
  const limit = opts.limit ?? 50;

  const rows = opts.before
    ? db
        .prepare(
          `SELECT id, task_id, changed_by_id, changed_at, changes
           FROM task_history WHERE task_id = ? AND id < ?
           ORDER BY id DESC LIMIT ?`,
        )
        .all(taskId, opts.before, limit) as any[]
    : db
        .prepare(
          `SELECT id, task_id, changed_by_id, changed_at, changes
           FROM task_history WHERE task_id = ?
           ORDER BY id DESC LIMIT ?`,
        )
        .all(taskId, limit) as any[];

  const entries: TaskHistoryEntry[] = rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    changedById: r.changed_by_id,
    changedAt: r.changed_at,
    changes: JSON.parse(r.changes),
  }));

  const nextCursor = entries.length === limit ? entries[entries.length - 1].id : null;
  return { entries, nextCursor };
}
