/**
 * SyncObserver - Platform-agnostic progress reporting for sync operations.
 *
 * Events are plain data (no terminal codes, no formatting). The CLI layer
 * or platform layer subscribes and renders however it likes.
 *
 * Only "leaf" tasks that actually call loaders emit events - structural
 * tasks (sync-group, sync-step) are excluded.
 */

import type { EntityType } from "@max/core";
import type { SyncResult } from "./sync-handle.js";

// ============================================================================
// Events
// ============================================================================

export type SyncProgressEvent =
  | { kind: "sync-started"; stepCount: number }
  | { kind: "task-completed"; entityType: EntityType; operation: "load-fields" | "load-collection" }
  | { kind: "task-failed"; entityType: EntityType; operation: string; error: string }
  | { kind: "sync-completed"; result: SyncResult }

// ============================================================================
// Observer
// ============================================================================

export interface SyncObserver {
  onEvent(event: SyncProgressEvent): void
}
