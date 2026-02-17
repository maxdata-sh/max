/**
 * @max/execution - Execution layer for Max sync operations.
 */

// Task types
export type {
  TaskId,
  TaskState,
  TaskPayload,
  LoadFieldsPayload,
  LoadCollectionPayload,
  SyncStepPayload,
  SyncGroupPayload,
  SerialisedStep,
  SerialisedStepTarget,
  SerialisedStepOperation,
  Task,
} from "./task.js";

// TaskStore
export type { TaskStore, TaskTemplate } from "./task-store.js";

// TaskRunner
export type { TaskRunner, TaskRunResult, TaskChildTemplate } from "./task-runner.js";

// SyncQueryEngine
export type { SyncQueryEngine } from "./sync-query-engine.js";

// SyncHandle
export type {
  SyncId,
  SyncStatus,
  SyncResult,
  SyncHandle,
  SyncRegistry,
} from "./sync-handle.js";

// FIXME: we should pull this into @max/execution
export { SyncPlan } from '@max/core'

// Registry
export type { ExecutionRegistry } from "./registry.js";

// PlanExpander
export { PlanExpander } from "./plan-expander.js";

// SyncExecutor
export { SyncExecutor } from "./sync-executor.js";
export type { SyncExecutorConfig } from "./sync-executor.js";

// Errors
export { Execution, ErrUnknownEntityType, ErrNoResolver, ErrNoCollectionLoader, ErrTaskNotFound, ErrLoaderDepsNotSupported, ErrNoDepsAvailable } from "./errors.js";
