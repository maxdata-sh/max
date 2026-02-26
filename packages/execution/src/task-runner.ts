/**
 * TaskRunner - Interface for executing individual tasks.
 *
 * The SyncExecutor orchestrates the task graph (claim, enqueue, complete).
 * The TaskRunner handles the actual work of each task (call loaders,
 * store results, track sync metadata).
 *
 * This separation keeps the executor abstract and testable while
 * containing loader dispatch and `as any` casts in the concrete runner.
 */

import type {EntityType} from "@max/core";
import type {TaskPayload, TaskState} from "./task.js";

// ============================================================================
// TaskRunResult
// ============================================================================

/** Describes a child task to spawn */
export interface TaskChildTemplate {
  readonly state: TaskState;
  readonly payload: TaskPayload;
}

/**
 * Result of executing a task.
 *
 * If children are returned, the executor enqueues them as children
 * of the current task and moves the task to awaiting_children.
 */
/** Progress metadata for inline work done by a task (e.g. batch field loading). */
export interface TaskProgress {
  readonly entityType: EntityType;
  readonly operation: "load-fields" | "load-collection";
  readonly count: number;
}

export interface TaskRunResult {
  /** Child tasks to spawn. Executor sets parentId and syncId. */
  readonly children?: readonly TaskChildTemplate[];
  /** Progress from inline work that should be reported to the observer. */
  readonly progress?: TaskProgress;
}

// ============================================================================
// TaskRunner Interface
// ============================================================================

export interface TaskRunner {
  /**
   * Execute a task. Side effects (engine.store, syncMeta.recordFieldSync)
   * happen internally. Returns child tasks to spawn (if any).
   */
  execute(task: { readonly payload: TaskPayload }): Promise<TaskRunResult>;
}
