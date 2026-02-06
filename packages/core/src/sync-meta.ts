/**
 * SyncMeta - Interface for tracking sync metadata per entity.
 *
 * Staleness is per-field, not per-loader. An entity is "synced" when all
 * its fields are populated and non-stale. Stored separately from entity
 * data (companion table), but JOINable for efficient filtered queries.
 */

import {StaticTypeCompanion} from "./companion.js";
import type {Id} from "./brand.js";
import type {RefAny} from "./ref.js";

// ============================================================================
// Duration
// ============================================================================

/** Duration in milliseconds */
export type Duration = Id<"duration-ms">;

export const Duration = StaticTypeCompanion({
  ms(n: number): Duration { return n as Duration; },
  seconds(n: number): Duration { return (n * 1_000) as Duration; },
  minutes(n: number): Duration { return (n * 60_000) as Duration; },
  hours(n: number): Duration { return (n * 3_600_000) as Duration; },
  days(n: number): Duration { return (n * 86_400_000) as Duration; },
});

// ============================================================================
// SyncMeta Interface
// ============================================================================

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
