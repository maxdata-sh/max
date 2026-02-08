import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { initSchema } from "./schema.ts";
import { generateApiKey, storeApiKey, validateApiKey, getActiveApiKey, rotateApiKey } from "./auth.ts";
import { appendChange, getChanges, getLatestCursor, getRecentChanges, appendTaskHistory, getTaskHistory } from "./changelog.ts";
import { registerWebhook, unregisterWebhook, listWebhooks, dispatchWebhooks, getRecentDeliveries } from "./webhooks.ts";
import type {
  TenantConfig, EntityType,
  Workspace, WorkspaceInput, WorkspacePatch,
  User, UserInput, UserPatch,
  Project, ProjectInput, ProjectPatch,
  Task, TaskInput, TaskPatch,
  File, FileInput, FilePatch,
  ChangeEvent, TaskHistoryEntry,
  WebhookPayload, WebhookRegistration, WebhookDelivery,
  SeedOptions, SeedResult, GenerationOpts,
} from "./types.ts";

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function now(): string {
  return new Date().toISOString();
}

export class Tenant {
  readonly name: string;
  readonly db: Database;
  private webhookCallbacks: Array<(payload: WebhookPayload) => void> = [];
  private generationTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(name: string, db: Database) {
    this.name = name;
    this.db = db;
  }

  static create(config: TenantConfig): Tenant {
    let db: Database;
    if (config.storage === "memory") {
      db = new Database(":memory:");
    } else {
      const dir = join(config.dataDir ?? "tenants", config.name);
      mkdirSync(dir, { recursive: true });
      db = new Database(join(dir, "acme.db"));
    }
    initSchema(db);

    const tenant = new Tenant(config.name, db);

    // Generate initial API key
    const key = generateApiKey();
    storeApiKey(db, key);

    return tenant;
  }

  static open(name: string, dataDir?: string): Tenant {
    const dir = join(dataDir ?? "tenants", name);
    const dbPath = join(dir, "acme.db");
    if (!existsSync(dbPath)) {
      throw new Error(`Tenant "${name}" not found at ${dbPath}`);
    }
    const db = new Database(dbPath);
    initSchema(db); // idempotent — CREATE IF NOT EXISTS
    return new Tenant(name, db);
  }

  static list(dataDir?: string): string[] {
    const dir = dataDir ?? "tenants";
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  dispose(): void {
    this.stopContinuousGeneration();
    this.db.close();
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  getApiKey(): string {
    return getActiveApiKey(this.db) ?? rotateApiKey(this.db);
  }

  validateApiKey(key: string): boolean {
    return validateApiKey(this.db, key);
  }

  rotateApiKey(): string {
    return rotateApiKey(this.db);
  }

  // -------------------------------------------------------------------------
  // Changelog
  // -------------------------------------------------------------------------

  getChanges(since?: number, limit?: number): { events: ChangeEvent[]; nextCursor: number } {
    return getChanges(this.db, since, limit);
  }

  getLatestCursor(): number {
    return getLatestCursor(this.db);
  }

  getRecentChanges(limit?: number): ChangeEvent[] {
    return getRecentChanges(this.db, limit);
  }

  getTaskHistory(
    taskId: string,
    opts?: { before?: number; limit?: number },
  ): { entries: TaskHistoryEntry[]; nextCursor: number | null } {
    return getTaskHistory(this.db, taskId, opts);
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  registerWebhook(url: string): WebhookRegistration {
    return registerWebhook(this.db, url);
  }

  unregisterWebhook(id: string): void {
    unregisterWebhook(this.db, id);
  }

  listWebhooks(): WebhookRegistration[] {
    return listWebhooks(this.db);
  }

  getRecentDeliveries(limit?: number): WebhookDelivery[] {
    return getRecentDeliveries(this.db, limit);
  }

  onWebhook(callback: (payload: WebhookPayload) => void): () => void {
    this.webhookCallbacks.push(callback);
    return () => {
      this.webhookCallbacks = this.webhookCallbacks.filter((cb) => cb !== callback);
    };
  }

  private fireWebhooks(payload: WebhookPayload): void {
    // Fire-and-forget — don't block the mutation
    dispatchWebhooks(this.db, payload, this.webhookCallbacks);
  }

  // -------------------------------------------------------------------------
  // Internal: mutation helper
  // -------------------------------------------------------------------------

  private mutate<T>(
    entityType: EntityType,
    entityId: string,
    action: "create" | "update" | "delete",
    payload: Record<string, unknown> | null,
    fn: () => T,
  ): T {
    const result = this.db.transaction(() => {
      const r = fn();
      appendChange(this.db, { entityType, entityId, action, payload });
      return r;
    })();

    const cursor = getLatestCursor(this.db);
    this.fireWebhooks({ entityType, entityId, action, cursor, timestamp: now() });
    return result;
  }

  // -------------------------------------------------------------------------
  // Workspaces
  // -------------------------------------------------------------------------

  createWorkspace(input: WorkspaceInput): Workspace {
    const id = genId("ws");
    const ts = now();
    const ws: Workspace = { id, name: input.name, createdAt: ts, updatedAt: ts };
    return this.mutate("workspace", id, "create", ws as any, () => {
      this.db
        .prepare("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(id, input.name, ts, ts);
      return ws;
    });
  }

  getWorkspace(id: string): Workspace | null {
    const r = this.db
      .prepare("SELECT id, name, created_at, updated_at FROM workspaces WHERE id = ? AND deleted_at IS NULL")
      .get(id) as any;
    return r ? { id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at } : null;
  }

  listWorkspaces(): Workspace[] {
    const rows = this.db
      .prepare("SELECT id, name, created_at, updated_at FROM workspaces WHERE deleted_at IS NULL")
      .all() as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  updateWorkspace(id: string, patch: WorkspacePatch): Workspace {
    const ts = now();
    return this.mutate("workspace", id, "update", { ...patch } as any, () => {
      const sets: string[] = ["updated_at = ?"];
      const vals: any[] = [ts];
      if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
      vals.push(id);
      this.db.prepare(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      return this.getWorkspace(id)!;
    });
  }

  deleteWorkspace(id: string): void {
    this.mutate("workspace", id, "delete", null, () => {
      this.db.prepare("UPDATE workspaces SET deleted_at = ? WHERE id = ?").run(now(), id);
    });
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  createUser(input: UserInput): User {
    const id = genId("usr");
    const ts = now();
    const user: User = {
      id, workspaceId: input.workspaceId, email: input.email,
      displayName: input.displayName, role: input.role ?? "member",
      active: input.active ?? true, createdAt: ts, updatedAt: ts,
    };
    return this.mutate("user", id, "create", user as any, () => {
      this.db
        .prepare(
          `INSERT INTO users (id, workspace_id, email, display_name, role, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, user.workspaceId, user.email, user.displayName, user.role, user.active ? 1 : 0, ts, ts);
      return user;
    });
  }

  getUser(id: string): User | null {
    const r = this.db
      .prepare(
        `SELECT id, workspace_id, email, display_name, role, active, created_at, updated_at
         FROM users WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as any;
    return r
      ? {
          id: r.id, workspaceId: r.workspace_id, email: r.email,
          displayName: r.display_name, role: r.role, active: Boolean(r.active),
          createdAt: r.created_at, updatedAt: r.updated_at,
        }
      : null;
  }

  listUsers(workspaceId?: string): User[] {
    const sql = workspaceId
      ? "SELECT id, workspace_id, email, display_name, role, active, created_at, updated_at FROM users WHERE workspace_id = ? AND deleted_at IS NULL"
      : "SELECT id, workspace_id, email, display_name, role, active, created_at, updated_at FROM users WHERE deleted_at IS NULL";
    const rows = (workspaceId ? this.db.prepare(sql).all(workspaceId) : this.db.prepare(sql).all()) as any[];
    return rows.map((r) => ({
      id: r.id, workspaceId: r.workspace_id, email: r.email,
      displayName: r.display_name, role: r.role, active: Boolean(r.active),
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  updateUser(id: string, patch: UserPatch): User {
    const ts = now();
    return this.mutate("user", id, "update", { ...patch } as any, () => {
      const sets: string[] = ["updated_at = ?"];
      const vals: any[] = [ts];
      if (patch.email !== undefined) { sets.push("email = ?"); vals.push(patch.email); }
      if (patch.displayName !== undefined) { sets.push("display_name = ?"); vals.push(patch.displayName); }
      if (patch.role !== undefined) { sets.push("role = ?"); vals.push(patch.role); }
      if (patch.active !== undefined) { sets.push("active = ?"); vals.push(patch.active ? 1 : 0); }
      vals.push(id);
      this.db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      return this.getUser(id)!;
    });
  }

  deleteUser(id: string): void {
    this.mutate("user", id, "delete", null, () => {
      this.db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").run(now(), id);
    });
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  createProject(input: ProjectInput): Project {
    const id = genId("prj");
    const ts = now();
    const project: Project = {
      id, workspaceId: input.workspaceId, name: input.name,
      description: input.description ?? null, status: input.status ?? "active",
      ownerId: input.ownerId, createdAt: ts, updatedAt: ts,
    };
    return this.mutate("project", id, "create", project as any, () => {
      this.db
        .prepare(
          `INSERT INTO projects (id, workspace_id, name, description, status, owner_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, project.workspaceId, project.name, project.description, project.status, project.ownerId, ts, ts);
      return project;
    });
  }

  getProject(id: string): Project | null {
    const r = this.db
      .prepare(
        `SELECT id, workspace_id, name, description, status, owner_id, created_at, updated_at
         FROM projects WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as any;
    return r
      ? {
          id: r.id, workspaceId: r.workspace_id, name: r.name,
          description: r.description, status: r.status, ownerId: r.owner_id,
          createdAt: r.created_at, updatedAt: r.updated_at,
        }
      : null;
  }

  listProjects(workspaceId?: string): Project[] {
    const sql = workspaceId
      ? "SELECT id, workspace_id, name, description, status, owner_id, created_at, updated_at FROM projects WHERE workspace_id = ? AND deleted_at IS NULL"
      : "SELECT id, workspace_id, name, description, status, owner_id, created_at, updated_at FROM projects WHERE deleted_at IS NULL";
    const rows = (workspaceId ? this.db.prepare(sql).all(workspaceId) : this.db.prepare(sql).all()) as any[];
    return rows.map((r) => ({
      id: r.id, workspaceId: r.workspace_id, name: r.name,
      description: r.description, status: r.status, ownerId: r.owner_id,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  updateProject(id: string, patch: ProjectPatch): Project {
    const ts = now();
    return this.mutate("project", id, "update", { ...patch } as any, () => {
      const sets: string[] = ["updated_at = ?"];
      const vals: any[] = [ts];
      if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
      if (patch.description !== undefined) { sets.push("description = ?"); vals.push(patch.description); }
      if (patch.status !== undefined) { sets.push("status = ?"); vals.push(patch.status); }
      if (patch.ownerId !== undefined) { sets.push("owner_id = ?"); vals.push(patch.ownerId); }
      vals.push(id);
      this.db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      return this.getProject(id)!;
    });
  }

  deleteProject(id: string): void {
    this.mutate("project", id, "delete", null, () => {
      this.db.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").run(now(), id);
    });
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  createTask(input: TaskInput): Task {
    const id = genId("tsk");
    const ts = now();
    const task: Task = {
      id, projectId: input.projectId, title: input.title,
      description: input.description ?? null, status: input.status ?? "todo",
      priority: input.priority ?? "medium", assigneeId: input.assigneeId ?? null,
      createdById: input.createdById, lastModifiedById: input.createdById,
      dueDate: input.dueDate ?? null, tags: input.tags ?? [],
      completedAt: null, createdAt: ts, updatedAt: ts,
    };
    return this.mutate("task", id, "create", task as any, () => {
      this.db
        .prepare(
          `INSERT INTO tasks (id, project_id, title, description, status, priority,
           assignee_id, created_by_id, last_modified_by_id, due_date, tags, completed_at,
           created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id, task.projectId, task.title, task.description, task.status, task.priority,
          task.assigneeId, task.createdById, task.lastModifiedById, task.dueDate,
          JSON.stringify(task.tags), task.completedAt, ts, ts,
        );
      return task;
    });
  }

  getTask(id: string): Task | null {
    const r = this.db
      .prepare(
        `SELECT id, project_id, title, description, status, priority, assignee_id,
         created_by_id, last_modified_by_id, due_date, tags, completed_at, created_at, updated_at
         FROM tasks WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as any;
    return r ? this.rowToTask(r) : null;
  }

  listTasks(projectId?: string): Task[] {
    const sql = projectId
      ? `SELECT id, project_id, title, description, status, priority, assignee_id,
         created_by_id, last_modified_by_id, due_date, tags, completed_at, created_at, updated_at
         FROM tasks WHERE project_id = ? AND deleted_at IS NULL`
      : `SELECT id, project_id, title, description, status, priority, assignee_id,
         created_by_id, last_modified_by_id, due_date, tags, completed_at, created_at, updated_at
         FROM tasks WHERE deleted_at IS NULL`;
    const rows = (projectId ? this.db.prepare(sql).all(projectId) : this.db.prepare(sql).all()) as any[];
    return rows.map((r) => this.rowToTask(r));
  }

  updateTask(id: string, patch: TaskPatch): Task {
    const before = this.getTask(id);
    if (!before) throw new Error(`Task "${id}" not found`);

    const ts = now();
    // Compute changed fields for changelog (only changed fields for tasks)
    const changedPayload: Record<string, unknown> = {};
    const historyChanges: Record<string, { before: unknown; after: unknown }> = {};

    const checkField = (field: keyof TaskPatch, beforeVal: unknown) => {
      const patchVal = patch[field];
      if (patchVal !== undefined && patchVal !== beforeVal) {
        changedPayload[field] = patchVal;
        historyChanges[field] = { before: beforeVal, after: patchVal };
      }
    };

    checkField("title", before.title);
    checkField("description", before.description);
    checkField("status", before.status);
    checkField("priority", before.priority);
    checkField("assigneeId", before.assigneeId);
    checkField("dueDate", before.dueDate);
    checkField("tags", before.tags);

    return this.mutate("task", id, "update", changedPayload, () => {
      const sets: string[] = ["updated_at = ?", "last_modified_by_id = ?"];
      const vals: any[] = [ts, patch.lastModifiedById];
      if (patch.title !== undefined) { sets.push("title = ?"); vals.push(patch.title); }
      if (patch.description !== undefined) { sets.push("description = ?"); vals.push(patch.description); }
      if (patch.status !== undefined) {
        sets.push("status = ?"); vals.push(patch.status);
        if (patch.status === "done") { sets.push("completed_at = ?"); vals.push(ts); }
      }
      if (patch.priority !== undefined) { sets.push("priority = ?"); vals.push(patch.priority); }
      if (patch.assigneeId !== undefined) { sets.push("assignee_id = ?"); vals.push(patch.assigneeId); }
      if (patch.dueDate !== undefined) { sets.push("due_date = ?"); vals.push(patch.dueDate); }
      if (patch.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(patch.tags)); }
      vals.push(id);
      this.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...vals);

      // Append to task history
      if (Object.keys(historyChanges).length > 0) {
        appendTaskHistory(this.db, { taskId: id, changedById: patch.lastModifiedById, changes: historyChanges });
      }

      return this.getTask(id)!;
    });
  }

  deleteTask(id: string): void {
    this.mutate("task", id, "delete", null, () => {
      this.db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(now(), id);
    });
  }

  private rowToTask(r: any): Task {
    return {
      id: r.id, projectId: r.project_id, title: r.title,
      description: r.description, status: r.status, priority: r.priority,
      assigneeId: r.assignee_id, createdById: r.created_by_id,
      lastModifiedById: r.last_modified_by_id, dueDate: r.due_date,
      tags: r.tags ? JSON.parse(r.tags) : [],
      completedAt: r.completed_at, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  createFile(input: FileInput): File {
    const id = genId("fil");
    const ts = now();
    const file: File = {
      id, projectId: input.projectId, name: input.name,
      mimeType: input.mimeType, sizeBytes: input.sizeBytes,
      createdById: input.createdById, lastModifiedById: input.createdById,
      createdAt: ts, updatedAt: ts,
    };
    return this.mutate("file", id, "create", file as any, () => {
      this.db
        .prepare(
          `INSERT INTO files (id, project_id, name, mime_type, size_bytes,
           created_by_id, last_modified_by_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, file.projectId, file.name, file.mimeType, file.sizeBytes, file.createdById, file.lastModifiedById, ts, ts);
      return file;
    });
  }

  getFile(id: string): File | null {
    const r = this.db
      .prepare(
        `SELECT id, project_id, name, mime_type, size_bytes,
         created_by_id, last_modified_by_id, created_at, updated_at
         FROM files WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as any;
    return r ? this.rowToFile(r) : null;
  }

  listFiles(projectId?: string): File[] {
    const sql = projectId
      ? `SELECT id, project_id, name, mime_type, size_bytes, created_by_id, last_modified_by_id, created_at, updated_at
         FROM files WHERE project_id = ? AND deleted_at IS NULL`
      : `SELECT id, project_id, name, mime_type, size_bytes, created_by_id, last_modified_by_id, created_at, updated_at
         FROM files WHERE deleted_at IS NULL`;
    const rows = (projectId ? this.db.prepare(sql).all(projectId) : this.db.prepare(sql).all()) as any[];
    return rows.map((r) => this.rowToFile(r));
  }

  updateFile(id: string, patch: FilePatch): File {
    const ts = now();
    // File updates have NO fields in changelog payload — consumer must re-fetch
    return this.mutate("file", id, "update", null, () => {
      const sets: string[] = ["updated_at = ?", "last_modified_by_id = ?"];
      const vals: any[] = [ts, patch.lastModifiedById];
      if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
      vals.push(id);
      this.db.prepare(`UPDATE files SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      return this.getFile(id)!;
    });
  }

  deleteFile(id: string): void {
    this.mutate("file", id, "delete", null, () => {
      this.db.prepare("UPDATE files SET deleted_at = ? WHERE id = ?").run(now(), id);
    });
  }

  private rowToFile(r: any): File {
    return {
      id: r.id, projectId: r.project_id, name: r.name,
      mimeType: r.mime_type, sizeBytes: r.size_bytes,
      createdById: r.created_by_id, lastModifiedById: r.last_modified_by_id,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  // -------------------------------------------------------------------------
  // Seeding (delegated to seed.ts, imported lazily to avoid circular dep)
  // -------------------------------------------------------------------------

  async seed(options?: SeedOptions): Promise<SeedResult> {
    const { seedTenant } = await import("./seed.ts");
    return seedTenant(this, options);
  }

  // -------------------------------------------------------------------------
  // Continuous generation
  // -------------------------------------------------------------------------

  startContinuousGeneration(opts?: GenerationOpts): void {
    if (this.generationTimer) return;
    const opsPerSecond = (opts?.tasksPerSecond ?? 1) + (opts?.mutationsPerSecond ?? 0);
    const interval = Math.max(50, Math.floor(1000 / opsPerSecond));

    const tasks = this.listTasks();
    const projects = this.listProjects();
    const users = this.listUsers();

    if (projects.length === 0 || users.length === 0) {
      throw new Error("Seed data first — need at least one project and one user");
    }

    let tick = 0;
    this.generationTimer = setInterval(() => {
      try {
        const mutationRate = opts?.mutationsPerSecond ?? 0;
        const doMutation = mutationRate > 0 && tick % Math.ceil(opsPerSecond / mutationRate) === 0;

        if (doMutation && tasks.length > 0) {
          // Mutate a random existing task
          const task = tasks[tick % tasks.length];
          const statuses = ["todo", "in_progress", "in_review", "done"] as const;
          this.updateTask(task.id, {
            status: statuses[tick % statuses.length],
            lastModifiedById: users[tick % users.length].id,
          });
        } else {
          // Create a new task
          const project = projects[tick % projects.length];
          const user = users[tick % users.length];
          const t = this.createTask({
            projectId: project.id,
            title: `Generated task #${tick}`,
            createdById: user.id,
          });
          tasks.push(t);
        }
        tick++;
      } catch {
        // swallow errors in background generation
      }
    }, interval);
  }

  stopContinuousGeneration(): void {
    if (this.generationTimer) {
      clearInterval(this.generationTimer);
      this.generationTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Introspection (for dashboard / debugging)
  // -------------------------------------------------------------------------

  get isGenerating(): boolean {
    return this.generationTimer !== null;
  }

  getStats(): {
    workspaces: number;
    users: number;
    projects: number;
    tasks: number;
    files: number;
    changelogSize: number;
    webhooks: number;
    generating: boolean;
  } {
    const count = (table: string) =>
      (this.db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE deleted_at IS NULL`).get() as any).c;
    return {
      workspaces: count("workspaces"),
      users: count("users"),
      projects: count("projects"),
      tasks: count("tasks"),
      files: count("files"),
      changelogSize: (this.db.prepare("SELECT COUNT(*) as c FROM changelog").get() as any).c,
      webhooks: (this.db.prepare("SELECT COUNT(*) as c FROM webhooks WHERE active = 1").get() as any).c,
      generating: this.isGenerating,
    };
  }
}
