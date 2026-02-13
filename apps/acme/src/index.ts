// Library API — re-exports everything consumers need

export { Tenant } from "./tenant.ts";
export { AcmeHttpClient } from "./client.ts";
export type { AcmeHttpClientConfig } from "./client.ts";
export { startServer } from "./server.ts";
export { seedTenant } from "./seed.ts";

export type {
  // Entity types
  EntityType,
  Workspace, WorkspaceInput, WorkspacePatch,
  User, UserInput, UserPatch,
  Project, ProjectInput, ProjectPatch,
  Task, TaskInput, TaskPatch,
  File, FileInput, FilePatch,
  // Sync types
  ChangeEvent, TaskHistoryEntry,
  // Webhook types
  WebhookPayload, WebhookRegistration, WebhookDelivery,
  // Config types
  TenantConfig, SeedOptions, SeedResult, GenerationOpts,
  // Enums
  TaskStatus, TaskPriority, ProjectStatus, UserRole,
} from "./types.ts";
