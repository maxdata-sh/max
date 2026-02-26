// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

export type EntityType = "workspace" | "user" | "project" | "task" | "file";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "cancelled";
export type TaskPriority = "critical" | "high" | "medium" | "low" | "none";
export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type UserRole = "admin" | "member" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  workspaceId: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  createdById: string;
  lastModifiedById: string;
  dueDate: string | null;
  tags: string[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface File {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdById: string;
  lastModifiedById: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Input types (for creation — system generates id, createdAt, updatedAt)
// ---------------------------------------------------------------------------

export interface WorkspaceInput {
  name: string;
}

export interface UserInput {
  workspaceId: string;
  email: string;
  displayName: string;
  role?: UserRole;
  active?: boolean;
}

export interface ProjectInput {
  workspaceId: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  ownerId: string;
}

export interface TaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  createdById: string;
  dueDate?: string;
  tags?: string[];
}

export interface FileInput {
  projectId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdById: string;
}

// ---------------------------------------------------------------------------
// Patch types (for updates — all fields optional)
// ---------------------------------------------------------------------------

export interface WorkspacePatch {
  name?: string;
}

export interface UserPatch {
  email?: string;
  displayName?: string;
  role?: UserRole;
  active?: boolean;
}

export interface ProjectPatch {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  ownerId?: string;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  lastModifiedById: string;
  dueDate?: string | null;
  tags?: string[];
}

export interface FilePatch {
  name?: string;
  lastModifiedById: string;
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------

export interface ChangeEvent {
  sequence: number;
  entityType: EntityType;
  entityId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown> | null;
  timestamp: string;
}

export interface TaskHistoryEntry {
  id: number;
  taskId: string;
  changedById: string;
  changedAt: string;
  changes: Record<string, { before: unknown; after: unknown }>;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface WebhookRegistration {
  id: string;
  url: string;
  createdAt: string;
  active: boolean;
}

export interface WebhookPayload {
  entityType: EntityType;
  entityId: string;
  action: "create" | "update" | "delete";
  cursor: number;
  timestamp: string;
}

export interface WebhookDelivery {
  id: number;
  webhookId: string;
  payload: WebhookPayload;
  statusCode: number | null;
  deliveredAt: string;
  success: boolean;
}

// ---------------------------------------------------------------------------
// Tenant config
// ---------------------------------------------------------------------------

export interface TenantConfig {
  name: string;
  storage: "file" | "memory";
  dataDir?: string;
  auth?: {
    mode: "api-key" | "oauth" | "both";
    tokenRefresh?: boolean;
  };
  seed?: {
    global?: number;
    entity?: Partial<Record<EntityType, number>>;
  };
}

export interface SeedOptions {
  workspaces?: number;
  usersPerWorkspace?: number;
  projectsPerWorkspace?: number;
  tasksPerProject?: number;
  filesPerProject?: number;
  globalSeed?: number;
  entitySeeds?: Partial<Record<EntityType, number>>;
  /** If set, add projects to this workspace instead of creating new workspaces. */
  workspaceId?: string;
  /** If true, add tasks and files to all existing projects without creating new structures. */
  existingOnly?: boolean;
}

export interface SeedResult {
  workspaces: number;
  users: number;
  projects: number;
  tasks: number;
  files: number;
}

export interface GenerationOpts {
  tasksPerSecond?: number;
  mutationsPerSecond?: number;
}
