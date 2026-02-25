/**
 * SyncExecutor - The orchestrator for sync operations.
 *
 * Dependency-driven task execution:
 *   1. Expand SyncPlan into a full task graph (all tasks registered upfront)
 *   2. Single drain loop: claim → execute → complete → unblock dependents
 *   3. When a task spawns children, it moves to awaiting_children
 *   4. When all children complete, parent completes (recursively unblocking)
 *   5. When no active tasks remain, sync is done
 *
 * The executor is abstract — it delegates actual task execution to a
 * TaskRunner. Loader dispatch, engine.store, and syncMeta bookkeeping
 * all live in the runner, not here.
 *
 * This model survives restarts — all state is in the task store.
 */

import { Lifecycle, LifecycleManager, SyncPlan } from '@max/core'

import type {Task, TaskId, TaskPayload} from "./task.js";
import type {TaskStore} from "./task-store.js";
import type {TaskRunner} from "./task-runner.js";
import type {SyncHandle, SyncResult, SyncStatus, SyncRegistry, SyncId} from "./sync-handle.js";
import type {SyncObserver, SyncProgressEvent} from "./sync-observer.js";
import {PlanExpander} from "./plan-expander.js";

// ============================================================================
// Config
// ============================================================================

export interface SyncExecutorConfig {
  taskRunner: TaskRunner;
  taskStore: TaskStore;
}

// ============================================================================
// SyncExecutor
// ============================================================================

export class SyncExecutor implements Lifecycle {


  // FIXME: We need to propagate lifecycle onto these dependencies.
  // They're not currently lifecycle aware
  lifecycle = LifecycleManager.auto(() => [])

  private taskRunner: TaskRunner;
  private taskStore: TaskStore;
  private expander: PlanExpander;

  private activeSyncs = new Map<SyncId, SyncHandleImpl>();
  private syncCounter = 0;

  readonly syncs: SyncRegistry;

  constructor(config: SyncExecutorConfig) {
    this.taskRunner = config.taskRunner;
    this.taskStore = config.taskStore;
    this.expander = new PlanExpander();

    this.syncs = new SyncRegistryImpl(this.activeSyncs);
  }

  /** Execute a sync plan. Returns a handle immediately. */
  execute(plan: SyncPlan, options?: { syncId?: SyncId; observer?: SyncObserver }): SyncHandle {
    const syncId = options?.syncId ?? this.nextSyncId();
    const handle = new SyncHandleImpl(syncId, plan, options?.observer);
    this.activeSyncs.set(syncId, handle);

    this.runSync(handle).catch((err) => {
      handle.markFailed(err);
    });

    return handle;
  }

  // ============================================================================
  // Sync lifecycle
  // ============================================================================

  private async runSync(handle: SyncHandleImpl): Promise<void> {
    // 1. Expand full plan into task graph
    const templates = this.expander.expandPlan(handle.plan, handle.id);

    handle.emit({ kind: "sync-started", stepCount: templates.length });

    // 2. Enqueue all tasks with dependency resolution
    await this.taskStore.enqueueGraph(templates);

    // 3. Single drain loop
    await this.drainTasks(handle);

    if (!handle.isDone()) {
      handle.markCompleted(handle.tasksCompleted, handle.tasksFailed);
    }
  }

  private async drainTasks(handle: SyncHandleImpl): Promise<void> {
    while (!handle.isDone()) {
      // Respect pause
      if (handle.isPaused()) {
        await sleep(100);
        continue;
      }

      const task = await this.taskStore.claim(handle.id);
      if (!task) {
        if (!await this.taskStore.hasActiveTasks(handle.id)) break;
        await sleep(10);
        continue;
      }

      try {
        const spawnedChildren = await this.executeTask(task);
        if (spawnedChildren) {
          await this.taskStore.setAwaitingChildren(task.id);
        } else {
          const completed = await this.taskStore.complete(task.id);
          handle.tasksCompleted++;
          emitTaskCompleted(handle, task.payload);
          await this.onTaskCompleted(completed);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.taskStore.fail(task.id, message);
        handle.tasksFailed++;
        emitTaskFailed(handle, task.payload, message);
      }
    }
  }

  /**
   * After a task completes:
   * 1. Unblock any tasks waiting on this one (blockedBy = this task)
   * 2. If this task has a parent, check if all siblings are done
   *    → if so, complete the parent (recursively)
   */
  private async onTaskCompleted(task: Task): Promise<void> {
    await this.taskStore.unblockDependents(task.id);

    if (task.parentId) {
      const allDone = await this.taskStore.allChildrenComplete(task.parentId);
      if (allDone) {
        const parent = await this.taskStore.complete(task.parentId);
        await this.onTaskCompleted(parent);
      }
    }
  }

  // ============================================================================
  // Task execution — delegates to TaskRunner
  // ============================================================================

  private async executeTask(task: Task): Promise<boolean> {
    const result = await this.taskRunner.execute(task);

    if (result.children?.length) {
      for (const child of result.children) {
        await this.taskStore.enqueue({
          syncId: task.syncId,
          state: child.state,
          parentId: task.id,
          payload: child.payload,
        });
      }
      return true;
    }

    return false;
  }

  // ============================================================================
  // ID generation
  // ============================================================================

  private nextSyncId(): SyncId {
    return `sync-${++this.syncCounter}` as SyncId;
  }
}

// ============================================================================
// SyncHandle Implementation
// ============================================================================

class SyncHandleImpl implements SyncHandle {
  readonly startedAt = new Date();
  private _status: SyncStatus = "running";
  private resolveCompletion!: (result: SyncResult) => void;
  private completionPromise: Promise<SyncResult>;
  private observer?: SyncObserver;

  tasksCompleted = 0;
  tasksFailed = 0;

  constructor(
    readonly id: SyncId,
    readonly plan: SyncPlan,
    observer?: SyncObserver,
  ) {
    this.observer = observer;
    this.completionPromise = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  emit(event: SyncProgressEvent): void {
    this.observer?.onEvent(event);
  }

  async status(): Promise<SyncStatus> { return this._status; }
  isPaused(): boolean { return this._status === "paused"; }
  async pause(): Promise<void> { this._status = "paused"; }
  async resume(): Promise<void> {
    if (this._status === "paused") this._status = "running";
  }
  async cancel(): Promise<void> {
    this._status = "cancelled";
    this.resolveCompletion(this.buildResult());
  }
  completion(): Promise<SyncResult> { return this.completionPromise; }
  isDone(): boolean {
    return this._status === "completed" || this._status === "failed" || this._status === "cancelled";
  }

  markCompleted(completed: number, failed: number): void {
    this.tasksCompleted = completed;
    this.tasksFailed = failed;
    this._status = "completed";
    const result = this.buildResult();
    this.emit({ kind: "sync-completed", result });
    this.resolveCompletion(result);
  }

  markFailed(err: unknown): void {
    this._status = "failed";
    const result = this.buildResult();
    this.emit({ kind: "sync-completed", result });
    this.resolveCompletion(result);
  }

  private buildResult(): SyncResult {
    return {
      status: this._status,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      duration: Date.now() - this.startedAt.getTime(),
    };
  }
}

// ============================================================================
// SyncRegistry Implementation
// ============================================================================

class SyncRegistryImpl implements SyncRegistry {
  constructor(private syncs: Map<SyncId, SyncHandleImpl>) {}
  async list(): Promise<SyncHandle[]> { return Array.from(this.syncs.values()); }
  async get(id: SyncId): Promise<SyncHandle | null> { return this.syncs.get(id) ?? null; }
  async findDuplicate(plan: SyncPlan): Promise<SyncHandle | null> { return null; }
}

// ============================================================================
// Progress event helpers
// ============================================================================

/** Only leaf tasks that call loaders are worth reporting. */
function isProgressWorthy(payload: TaskPayload): payload is TaskPayload & { kind: "load-fields" | "load-collection" } {
  return payload.kind === "load-fields" || payload.kind === "load-collection";
}

function emitTaskCompleted(handle: SyncHandleImpl, payload: TaskPayload): void {
  if (isProgressWorthy(payload)) {
    handle.emit({
      kind: "task-completed",
      entityType: payload.entityType,
      operation: payload.kind,
    });
  }
}

function emitTaskFailed(handle: SyncHandleImpl, payload: TaskPayload, error: string): void {
  if (isProgressWorthy(payload)) {
    handle.emit({
      kind: "task-failed",
      entityType: payload.entityType,
      operation: payload.kind,
      error,
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
