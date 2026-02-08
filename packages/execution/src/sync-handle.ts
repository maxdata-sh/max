/**
 * SyncHandle - Handle for a running sync operation.
 *
 * Syncs can take days. execute() returns a handle, not a resolved promise.
 * The handle provides status queries, pause/cancel, and completion awaiting.
 */

import type {Id} from "@max/core";
import type {SyncPlan} from "@max/core";

// ============================================================================
// SyncId
// ============================================================================

export type SyncId = Id<"sync-id">;

// ============================================================================
// SyncStatus
// ============================================================================

export type SyncStatus = "running" | "paused" | "completed" | "failed" | "cancelled";

// ============================================================================
// SyncResult
// ============================================================================

export interface SyncResult {
  readonly status: SyncStatus;
  readonly tasksCompleted: number;
  readonly tasksFailed: number;
  readonly duration: number;
}

// ============================================================================
// SyncHandle
// ============================================================================

export interface SyncHandle {
  readonly id: SyncId;
  readonly plan: SyncPlan;
  readonly startedAt: Date;

  /** Get current status */
  status(): Promise<SyncStatus>;

  /** Pause the sync */
  pause(): Promise<void>;

  /** Cancel the sync */
  cancel(): Promise<void>;

  /** Await completion (or failure) */
  completion(): Promise<SyncResult>;
}

// ============================================================================
// SyncRegistry
// ============================================================================

/** List and inspect active syncs */
export interface SyncRegistry {
  /** List all sync handles */
  list(): Promise<SyncHandle[]>;

  /** Get a sync handle by ID */
  get(id: SyncId): Promise<SyncHandle | null>;

  /** Check if an equivalent plan is already running */
  findDuplicate(plan: SyncPlan): Promise<SyncHandle | null>;
}
