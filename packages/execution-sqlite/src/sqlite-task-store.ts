/**
 * SqliteTaskStore - SQLite-backed implementation of TaskStore.
 *
 * Persists tasks in the _max_tasks table. Uses an incrementing counter
 * for ID generation, resuming from existing data on construction.
 */

import type { Database } from "bun:sqlite";
import type {
  Task,
  TaskId,
  TaskState,
  TaskPayload,
  TaskStore,
  TaskTemplate,
  SyncId,
} from "@max/execution";
import { ErrTaskNotFound } from "@max/execution";

// ============================================================================
// Row types
// ============================================================================

interface TaskRow {
  id: string;
  sync_id: string;
  state: string;
  payload: string;
  parent_id: string | null;
  blocked_by: string | null;
  not_before: number | null;
  created_at: number;
  completed_at: number | null;
  error: string | null;
}

// ============================================================================
// Row ↔ Task conversion
// ============================================================================

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id as TaskId,
    syncId: row.sync_id as SyncId,
    state: row.state as TaskState,
    payload: JSON.parse(row.payload) as TaskPayload,
    parentId: row.parent_id ? (row.parent_id as TaskId) : undefined,
    blockedBy: row.blocked_by ? (row.blocked_by as TaskId) : undefined,
    notBefore: row.not_before != null ? new Date(row.not_before) : undefined,
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at != null ? new Date(row.completed_at) : undefined,
    error: row.error ?? undefined,
  };
}

// ============================================================================
// SqliteTaskStore
// ============================================================================

export class SqliteTaskStore implements TaskStore {
  private counter: number;

  constructor(private db: Database) {
    // Resume counter from existing data
    const row = db.query("SELECT MAX(CAST(id AS INTEGER)) as max_id FROM _max_tasks").get() as
      | { max_id: number | null }
      | null;
    this.counter = row?.max_id ?? 0;
  }

  private nextId(): TaskId {
    return String(++this.counter) as TaskId;
  }

  async enqueue(task: Omit<Task, "id" | "createdAt">): Promise<TaskId> {
    const id = this.nextId();
    const now = Date.now();

    this.db.run(
      `INSERT INTO _max_tasks (id, sync_id, state, payload, parent_id, blocked_by, not_before, created_at, completed_at, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        task.syncId,
        task.state,
        JSON.stringify(task.payload),
        task.parentId ?? null,
        task.blockedBy ?? null,
        task.notBefore ? task.notBefore.getTime() : null,
        now,
        task.completedAt ? task.completedAt.getTime() : null,
        task.error ?? null,
      ],
    );

    return id;
  }

  async enqueueGraph(templates: TaskTemplate[]): Promise<Map<string, TaskId>> {
    const tempToReal = new Map<string, TaskId>();

    // First pass: assign real IDs
    for (const template of templates) {
      tempToReal.set(template.tempId, this.nextId());
    }

    // Second pass: batch INSERT in a transaction
    const insert = this.db.prepare(
      `INSERT INTO _max_tasks (id, sync_id, state, payload, parent_id, blocked_by, not_before, created_at, completed_at, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const now = Date.now();

    this.db.transaction(() => {
      for (const template of templates) {
        const { tempId, parentId, blockedBy, ...rest } = template;
        const realId = tempToReal.get(tempId)!;

        insert.run(
          realId,
          rest.syncId,
          rest.state,
          JSON.stringify(rest.payload),
          parentId ? tempToReal.get(parentId) ?? null : null,
          blockedBy ? tempToReal.get(blockedBy) ?? null : null,
          rest.notBefore ? rest.notBefore.getTime() : null,
          now,
          rest.completedAt ? rest.completedAt.getTime() : null,
          rest.error ?? null,
        );
      }
    })();

    return tempToReal;
  }

  async claim(syncId: SyncId): Promise<Task | null> {
    const now = Date.now();

    const result = this.db.transaction(() => {
      const row = this.db
        .query(
          `SELECT * FROM _max_tasks
           WHERE sync_id = ? AND state = 'pending' AND (not_before IS NULL OR not_before <= ?)
           LIMIT 1`,
        )
        .get(syncId, now) as TaskRow | null;

      if (!row) return null;

      this.db.run(`UPDATE _max_tasks SET state = 'running' WHERE id = ?`, [row.id]);

      return { ...row, state: "running" } as TaskRow;
    })();

    return result ? rowToTask(result) : null;
  }

  async complete(id: TaskId): Promise<Task> {
    const now = Date.now();
    this.db.run(`UPDATE _max_tasks SET state = 'completed', completed_at = ? WHERE id = ?`, [
      now,
      id,
    ]);

    const row = this.db.query(`SELECT * FROM _max_tasks WHERE id = ?`).get(id) as TaskRow | null;
    if (!row) throw ErrTaskNotFound.create({ taskId: id });
    return rowToTask(row);
  }

  async setAwaitingChildren(id: TaskId): Promise<void> {
    this.db.run(`UPDATE _max_tasks SET state = 'awaiting_children' WHERE id = ?`, [id]);
  }

  async fail(id: TaskId, error: string): Promise<void> {
    const now = Date.now();
    this.db.run(
      `UPDATE _max_tasks SET state = 'failed', error = ?, completed_at = ? WHERE id = ?`,
      [error, now, id],
    );
  }

  async unblockDependents(completedTaskId: TaskId): Promise<number> {
    const result = this.db.run(
      `UPDATE _max_tasks SET state = 'pending' WHERE blocked_by = ? AND state = 'new'`,
      [completedTaskId],
    );
    return result.changes;
  }

  async allChildrenComplete(parentId: TaskId): Promise<boolean> {
    const total = this.db
      .query(`SELECT COUNT(*) as cnt FROM _max_tasks WHERE parent_id = ?`)
      .get(parentId) as { cnt: number };

    if (total.cnt === 0) return false;

    const incomplete = this.db
      .query(
        `SELECT COUNT(*) as cnt FROM _max_tasks WHERE parent_id = ? AND state != 'completed'`,
      )
      .get(parentId) as { cnt: number };

    return incomplete.cnt === 0;
  }

  async hasActiveTasks(syncId: SyncId): Promise<boolean> {
    const row = this.db
      .query(
        `SELECT EXISTS(
          SELECT 1 FROM _max_tasks
          WHERE sync_id = ? AND state IN ('pending','running')
        ) as active`,
      )
      .get(syncId) as { active: number };

    return row.active === 1;
  }

  async get(id: TaskId): Promise<Task | null> {
    const row = this.db.query(`SELECT * FROM _max_tasks WHERE id = ?`).get(id) as TaskRow | null;
    return row ? rowToTask(row) : null;
  }

  async pause(id: TaskId): Promise<void> {
    this.db.run(`UPDATE _max_tasks SET state = 'paused' WHERE id = ?`, [id]);
  }

  async cancel(id: TaskId): Promise<void> {
    this.db.run(`UPDATE _max_tasks SET state = 'cancelled' WHERE id = ?`, [id]);
  }
}
