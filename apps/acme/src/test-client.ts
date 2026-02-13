import type { AcmeClient } from "./client.ts";
import { Tenant } from "./tenant.ts";
import type {
  Workspace, WorkspaceInput, WorkspacePatch,
  User, UserInput, UserPatch,
  Project, ProjectInput, ProjectPatch,
  Task, TaskInput, TaskPatch,
  File, FileInput, FilePatch,
  ChangeEvent, TaskHistoryEntry,
  WebhookRegistration,
  SeedOptions, SeedResult,
} from "./types.ts";

export interface AcmeTestClientConfig {
  seed?: SeedOptions;
  tenantName?: string;
}

export class AcmeTestClient implements AcmeClient {
  readonly tenant: Tenant;

  constructor(config?: AcmeTestClientConfig) {
    this.tenant = Tenant.create({
      name: config?.tenantName ?? "test",
      storage: "memory",
    });
  }

  async seed(options?: SeedOptions): Promise<SeedResult> {
    return this.tenant.seed(options);
  }

  dispose(): void {
    this.tenant.dispose();
  }

  // -------------------------------------------------------------------------
  // Workspaces
  // -------------------------------------------------------------------------

  async listWorkspaces(): Promise<Workspace[]> {
    return this.tenant.listWorkspaces();
  }

  async getWorkspace(id: string): Promise<Workspace> {
    const ws = this.tenant.getWorkspace(id);
    if (!ws) throw new Error(`Workspace "${id}" not found`);
    return ws;
  }

  async createWorkspace(input: WorkspaceInput): Promise<Workspace> {
    return this.tenant.createWorkspace(input);
  }

  async updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
    return this.tenant.updateWorkspace(id, patch);
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.tenant.deleteWorkspace(id);
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  async listUsers(workspaceId?: string): Promise<User[]> {
    return this.tenant.listUsers(workspaceId);
  }

  async getUser(id: string): Promise<User> {
    const u = this.tenant.getUser(id);
    if (!u) throw new Error(`User "${id}" not found`);
    return u;
  }

  async createUser(input: UserInput): Promise<User> {
    return this.tenant.createUser(input);
  }

  async updateUser(id: string, patch: UserPatch): Promise<User> {
    return this.tenant.updateUser(id, patch);
  }

  async deleteUser(id: string): Promise<void> {
    this.tenant.deleteUser(id);
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  async listProjects(workspaceId?: string): Promise<Project[]> {
    return this.tenant.listProjects(workspaceId);
  }

  async getProject(id: string): Promise<Project> {
    const p = this.tenant.getProject(id);
    if (!p) throw new Error(`Project "${id}" not found`);
    return p;
  }

  async createProject(input: ProjectInput): Promise<Project> {
    return this.tenant.createProject(input);
  }

  async updateProject(id: string, patch: ProjectPatch): Promise<Project> {
    return this.tenant.updateProject(id, patch);
  }

  async deleteProject(id: string): Promise<void> {
    this.tenant.deleteProject(id);
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  async listTasks(projectId?: string): Promise<Task[]> {
    return this.tenant.listTasks(projectId);
  }

  async getTask(id: string): Promise<Task> {
    const t = this.tenant.getTask(id);
    if (!t) throw new Error(`Task "${id}" not found`);
    return t;
  }

  async createTask(input: TaskInput): Promise<Task> {
    return this.tenant.createTask(input);
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task> {
    return this.tenant.updateTask(id, patch);
  }

  async deleteTask(id: string): Promise<void> {
    this.tenant.deleteTask(id);
  }

  async getTaskHistory(
    taskId: string,
    opts?: { before?: number; limit?: number },
  ): Promise<{ entries: TaskHistoryEntry[]; nextCursor: number | null }> {
    return this.tenant.getTaskHistory(taskId, opts);
  }

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  async listFiles(projectId?: string): Promise<File[]> {
    return this.tenant.listFiles(projectId);
  }

  async getFile(id: string): Promise<File> {
    const f = this.tenant.getFile(id);
    if (!f) throw new Error(`File "${id}" not found`);
    return f;
  }

  async createFile(input: FileInput): Promise<File> {
    return this.tenant.createFile(input);
  }

  async updateFile(id: string, patch: FilePatch): Promise<File> {
    return this.tenant.updateFile(id, patch);
  }

  async deleteFile(id: string): Promise<void> {
    this.tenant.deleteFile(id);
  }

  // -------------------------------------------------------------------------
  // Changelog
  // -------------------------------------------------------------------------

  async getChanges(opts?: {
    since?: number;
    limit?: number;
  }): Promise<{ events: ChangeEvent[]; nextCursor: number }> {
    return this.tenant.getChanges(opts?.since, opts?.limit);
  }

  async getRecentChanges(limit?: number): Promise<ChangeEvent[]> {
    return this.tenant.getRecentChanges(limit);
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  async listWebhooks(): Promise<WebhookRegistration[]> {
    return this.tenant.listWebhooks();
  }

  async registerWebhook(url: string): Promise<WebhookRegistration> {
    return this.tenant.registerWebhook(url);
  }

  async deleteWebhook(id: string): Promise<void> {
    this.tenant.unregisterWebhook(id);
  }
}
