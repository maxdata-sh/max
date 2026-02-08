/**
 * TaskStore - Interface for persisting and managing tasks.
 *
 * The TaskStore is the execution layer's work queue. It supports
 * enqueueing, claiming, completing, and querying tasks.
 *
 * Tasks can reference each other via blockedBy (sequential dependency)
 * and parentId (parent awaits children). These use TaskId values.
 *
 * For bulk-enqueuing a task graph with inter-references before IDs are
 * assigned, use enqueueGraph() with temporary string IDs.
 */

import type {Task, TaskId} from "./task.js";
import type {SyncId} from "./sync-handle.js";

// ============================================================================
// TaskTemplate - for building task graphs before enqueue
// ============================================================================

/**
 * A task template with a temporary ID for building dependency graphs
 * before real IDs are assigned by the store.
 */
export interface TaskTemplate extends Omit<Task, "id" | "createdAt" | "parentId" | "blockedBy"> {
  /** Temporary ID for referencing within the graph */
  readonly tempId: string;
  /** Temp ID of parent task (resolved to real ID on enqueue) */
  readonly parentId?: string;
  /** Temp ID of blocking task (resolved to real ID on enqueue) */
  readonly blockedBy?: string;
}

// ============================================================================
// TaskStore Interface
// ============================================================================

export interface TaskStore {
  /** Enqueue a single task */
  enqueue(task: Omit<Task, "id" | "createdAt">): Promise<TaskId>;

  /** Enqueue a graph of tasks with temp IDs, resolving references to real IDs */
  enqueueGraph(templates: TaskTemplate[]): Promise<Map<string, TaskId>>;

  /** Claim the next pending task for a sync (state=pending, respects notBefore) */
  claim(syncId: SyncId): Promise<Task | null>;

  /** Mark a task as completed. Returns the completed task. */
  complete(id: TaskId): Promise<Task>;

  /** Mark a task as awaiting children */
  setAwaitingChildren(id: TaskId): Promise<void>;

  /** Mark a task as failed with an error message */
  fail(id: TaskId, error: string): Promise<void>;

  /** Transition tasks blocked by completedTaskId from new → pending */
  unblockDependents(completedTaskId: TaskId): Promise<number>;

  /** Check if all children of a parent task are completed */
  allChildrenComplete(parentId: TaskId): Promise<boolean>;

  /** Check if a sync has any tasks that can make progress (pending or running) */
  hasActiveTasks(syncId: SyncId): Promise<boolean>;

  /** Get a task by ID */
  get(id: TaskId): Promise<Task | null>;

  /** Pause a task */
  pause(id: TaskId): Promise<void>;

  /** Cancel a task */
  cancel(id: TaskId): Promise<void>;
}
