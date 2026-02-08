import type {RefAny} from "./ref.js";
import {Duration} from "./duration.js";

// ============================================================================
// SyncMeta Interface
// ============================================================================

/**
 * SyncMeta - Interface for tracking sync metadata per entity.
 *
 * Staleness is per-field, not per-loader. An entity is "synced" when all
 * its fields are populated and non-stale. Stored separately from entity
 * data (companion table), but JOINable for efficient filtered queries.
 */
export interface SyncMeta {
  /** Record that fields were synced for an entity */
  recordFieldSync(ref: RefAny, fields: string[], timestamp: Date): Promise<void>;

  /** When was this field last synced for this entity? */
  getFieldSyncTime(ref: RefAny, field: string): Promise<Date | null>;

  /** Which fields are stale (or never synced) for this entity? */
  staleFields(ref: RefAny, fields: string[], maxAge: Duration): Promise<string[]>;

  /** Mark specific fields as needing re-sync (omit fields to invalidate all) */
  invalidateFields(ref: RefAny, fields?: string[]): Promise<void>;

  /** Is this entity fully synced (all specified fields non-stale)? */
  isFullySynced(ref: RefAny, fields: string[], maxAge: Duration): Promise<boolean>;
}
