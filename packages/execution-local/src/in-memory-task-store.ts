/**
 * InMemoryTaskStore - Simple in-memory implementation of TaskStore.
 *
 * Array + counter. Enough to validate the architecture.
 */

import type {
  Task,
  TaskId,
  TaskState,
  TaskStore,
  TaskTemplate,
  SyncId,
} from "@max/execution";

// ============================================================================
// InMemoryTaskStore
// ============================================================================

export class InMemoryTaskStore implements TaskStore {
  private tasks: Task[] = [];
  private counter = 0;

  async enqueue(task: Omit<Task, "id" | "createdAt">): Promise<TaskId> {
    const id = String(++this.counter) as TaskId;
    this.tasks.push({
      ...task,
      id,
      createdAt: new Date(),
    });
    return id;
  }

  async enqueueGraph(templates: TaskTemplate[]): Promise<Map<string, TaskId>> {
    const tempToReal = new Map<string, TaskId>();

    // First pass: assign real IDs
    for (const template of templates) {
      const id = String(++this.counter) as TaskId;
      tempToReal.set(template.tempId, id);
    }

    // Second pass: create tasks with resolved references
    for (const template of templates) {
      const {tempId, parentId, blockedBy, ...rest} = template;
      const realId = tempToReal.get(tempId)!;

      this.tasks.push({
        ...rest,
        id: realId,
        parentId: parentId ? tempToReal.get(parentId) as TaskId : undefined,
        blockedBy: blockedBy ? tempToReal.get(blockedBy) as TaskId : undefined,
        createdAt: new Date(),
      });
    }

    return tempToReal;
  }

  async claim(syncId: SyncId): Promise<Task | null> {
    const now = new Date();
    const idx = this.tasks.findIndex(
      (t) => t.syncId === syncId && t.state === "pending" && (!t.notBefore || t.notBefore <= now),
    );
    if (idx === -1) return null;

    const task = this.tasks[idx]!;
    this.tasks[idx] = { ...task, state: "running" };
    return this.tasks[idx]!;
  }

  async complete(id: TaskId): Promise<Task> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Task not found: ${id}`);
    this.tasks[idx] = { ...this.tasks[idx]!, state: "completed", completedAt: new Date() };
    return this.tasks[idx]!;
  }

  async setAwaitingChildren(id: TaskId): Promise<void> {
    this.updateState(id, "awaiting_children");
  }

  async fail(id: TaskId, error: string): Promise<void> {
    this.updateState(id, "failed", { error, completedAt: new Date() });
  }

  async unblockDependents(completedTaskId: TaskId): Promise<number> {
    let unblocked = 0;
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i]!;
      if (task.blockedBy === completedTaskId && task.state === "new") {
        this.tasks[i] = { ...task, state: "pending" };
        unblocked++;
      }
    }
    return unblocked;
  }

  async allChildrenComplete(parentId: TaskId): Promise<boolean> {
    const children = this.tasks.filter((t) => t.parentId === parentId);
    return children.length > 0 && children.every((t) => t.state === "completed");
  }

  async hasActiveTasks(syncId: SyncId): Promise<boolean> {
    return this.tasks.some(
      (t) => t.syncId === syncId &&
        (t.state === "pending" || t.state === "running"),
    );
  }

  async get(id: TaskId): Promise<Task | null> {
    return this.tasks.find((t) => t.id === id) ?? null;
  }

  async pause(id: TaskId): Promise<void> {
    this.updateState(id, "paused");
  }

  async cancel(id: TaskId): Promise<void> {
    this.updateState(id, "cancelled");
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private updateState(id: TaskId, state: TaskState, extra?: Partial<Task>): void {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Task not found: ${id}`);
    this.tasks[idx] = { ...this.tasks[idx]!, state, ...extra };
  }
}
