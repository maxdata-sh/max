import type {
  Workspace, WorkspaceInput, WorkspacePatch,
  User, UserInput, UserPatch,
  Project, ProjectInput, ProjectPatch,
  Task, TaskInput, TaskPatch,
  File, FileInput, FilePatch,
  ChangeEvent, TaskHistoryEntry,
  WebhookRegistration,
} from "./types.ts";

export interface AcmeClient {
  // Workspaces
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace>;
  createWorkspace(input: WorkspaceInput): Promise<Workspace>;
  updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;
  // Users
  listUsers(workspaceId?: string): Promise<User[]>;
  getUser(id: string): Promise<User>;
  createUser(input: UserInput): Promise<User>;
  updateUser(id: string, patch: UserPatch): Promise<User>;
  deleteUser(id: string): Promise<void>;
  // Projects
  listProjects(workspaceId?: string): Promise<Project[]>;
  getProject(id: string): Promise<Project>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, patch: ProjectPatch): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  // Tasks
  listTasks(projectId?: string): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  getTaskHistory(taskId: string, opts?: { before?: number; limit?: number }): Promise<{ entries: TaskHistoryEntry[]; nextCursor: number | null }>;
  // Files
  listFiles(projectId?: string): Promise<File[]>;
  getFile(id: string): Promise<File>;
  createFile(input: FileInput): Promise<File>;
  updateFile(id: string, patch: FilePatch): Promise<File>;
  deleteFile(id: string): Promise<void>;
  // Changelog
  getChanges(opts?: { since?: number; limit?: number }): Promise<{ events: ChangeEvent[]; nextCursor: number }>;
  getRecentChanges(limit?: number): Promise<ChangeEvent[]>;
  // Webhooks
  listWebhooks(): Promise<WebhookRegistration[]>;
  registerWebhook(url: string): Promise<WebhookRegistration>;
  deleteWebhook(id: string): Promise<void>;
}

export interface AcmeHttpClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class AcmeHttpClient implements AcmeClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: AcmeHttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  // -------------------------------------------------------------------------
  // Workspaces
  // -------------------------------------------------------------------------

  listWorkspaces(): Promise<Workspace[]> {
    return this.get("/api/workspaces");
  }

  getWorkspace(id: string): Promise<Workspace> {
    return this.get(`/api/workspaces/${id}`);
  }

  createWorkspace(input: WorkspaceInput): Promise<Workspace> {
    return this.post("/api/workspaces", input);
  }

  updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
    return this.patch(`/api/workspaces/${id}`, patch);
  }

  deleteWorkspace(id: string): Promise<void> {
    return this.del(`/api/workspaces/${id}`);
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  listUsers(workspaceId?: string): Promise<User[]> {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : "";
    return this.get(`/api/users${qs}`);
  }

  getUser(id: string): Promise<User> {
    return this.get(`/api/users/${id}`);
  }

  createUser(input: UserInput): Promise<User> {
    return this.post("/api/users", input);
  }

  updateUser(id: string, patch: UserPatch): Promise<User> {
    return this.patch(`/api/users/${id}`, patch);
  }

  deleteUser(id: string): Promise<void> {
    return this.del(`/api/users/${id}`);
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  listProjects(workspaceId?: string): Promise<Project[]> {
    const qs = workspaceId ? `?workspaceId=${workspaceId}` : "";
    return this.get(`/api/projects${qs}`);
  }

  getProject(id: string): Promise<Project> {
    return this.get(`/api/projects/${id}`);
  }

  createProject(input: ProjectInput): Promise<Project> {
    return this.post("/api/projects", input);
  }

  updateProject(id: string, patch: ProjectPatch): Promise<Project> {
    return this.patch(`/api/projects/${id}`, patch);
  }

  deleteProject(id: string): Promise<void> {
    return this.del(`/api/projects/${id}`);
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  listTasks(projectId?: string): Promise<Task[]> {
    const qs = projectId ? `?projectId=${projectId}` : "";
    return this.get(`/api/tasks${qs}`);
  }

  getTask(id: string): Promise<Task> {
    return this.get(`/api/tasks/${id}`);
  }

  createTask(input: TaskInput): Promise<Task> {
    return this.post("/api/tasks", input);
  }

  updateTask(id: string, patch: TaskPatch): Promise<Task> {
    return this.patch(`/api/tasks/${id}`, patch);
  }

  deleteTask(id: string): Promise<void> {
    return this.del(`/api/tasks/${id}`);
  }

  getTaskHistory(
    taskId: string,
    opts?: { before?: number; limit?: number },
  ): Promise<{ entries: TaskHistoryEntry[]; nextCursor: number | null }> {
    const params = new URLSearchParams();
    if (opts?.before !== undefined) params.set("before", String(opts.before));
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.size ? `?${params}` : "";
    return this.get(`/api/tasks/${taskId}/history${qs}`);
  }

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  listFiles(projectId?: string): Promise<File[]> {
    const qs = projectId ? `?projectId=${projectId}` : "";
    return this.get(`/api/files${qs}`);
  }

  getFile(id: string): Promise<File> {
    return this.get(`/api/files/${id}`);
  }

  createFile(input: FileInput): Promise<File> {
    return this.post("/api/files", input);
  }

  updateFile(id: string, patch: FilePatch): Promise<File> {
    return this.patch(`/api/files/${id}`, patch);
  }

  deleteFile(id: string): Promise<void> {
    return this.del(`/api/files/${id}`);
  }

  // -------------------------------------------------------------------------
  // Changelog (sync)
  // -------------------------------------------------------------------------

  getChanges(opts?: {
    since?: number;
    limit?: number;
  }): Promise<{ events: ChangeEvent[]; nextCursor: number }> {
    const params = new URLSearchParams();
    if (opts?.since !== undefined) params.set("since", String(opts.since));
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.size ? `?${params}` : "";
    return this.get(`/api/changes${qs}`);
  }

  getRecentChanges(limit?: number): Promise<ChangeEvent[]> {
    const qs = limit !== undefined ? `?limit=${limit}` : "";
    return this.get(`/api/changes/recent${qs}`);
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  listWebhooks(): Promise<WebhookRegistration[]> {
    return this.get("/api/webhooks");
  }

  registerWebhook(url: string): Promise<WebhookRegistration> {
    return this.post("/api/webhooks", { url });
  }

  deleteWebhook(id: string): Promise<void> {
    return this.del(`/api/webhooks/${id}`);
  }

  // -------------------------------------------------------------------------
  // Fetch helpers
  // -------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`DELETE ${path}: ${res.status} ${await res.text()}`);
  }
}
