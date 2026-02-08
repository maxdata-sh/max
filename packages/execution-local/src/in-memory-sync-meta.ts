/**
 * InMemorySyncMeta - Simple in-memory implementation of SyncMeta.
 *
 * Tracks per-field sync timestamps in a Map.
 */

import type {SyncMeta, Duration, RefAny} from "@max/core";

// ============================================================================
// InMemorySyncMeta
// ============================================================================

export class InMemorySyncMeta implements SyncMeta {
  // Map<refKey, Map<fieldName, syncedAt>>
  private data = new Map<string, Map<string, Date>>();

  async recordFieldSync(ref: RefAny, fields: string[], timestamp: Date): Promise<void> {
    const key = ref.toKey() as string;
    let fieldMap = this.data.get(key);
    if (!fieldMap) {
      fieldMap = new Map();
      this.data.set(key, fieldMap);
    }
    for (const field of fields) {
      fieldMap.set(field, timestamp);
    }
  }

  async getFieldSyncTime(ref: RefAny, field: string): Promise<Date | null> {
    const key = ref.toKey() as string;
    const fieldMap = this.data.get(key);
    return fieldMap?.get(field) ?? null;
  }

  async staleFields(ref: RefAny, fields: string[], maxAge: Duration): Promise<string[]> {
    const key = ref.toKey() as string;
    const fieldMap = this.data.get(key);
    const now = Date.now();
    const maxAgeMs = maxAge as number;

    return fields.filter((field) => {
      const syncedAt = fieldMap?.get(field);
      if (!syncedAt) return true; // Never synced = stale
      return now - syncedAt.getTime() > maxAgeMs;
    });
  }

  async invalidateFields(ref: RefAny, fields?: string[]): Promise<void> {
    const key = ref.toKey() as string;
    if (!fields) {
      this.data.delete(key);
    } else {
      const fieldMap = this.data.get(key);
      if (fieldMap) {
        for (const field of fields) {
          fieldMap.delete(field);
        }
      }
    }
  }

  async isFullySynced(ref: RefAny, fields: string[], maxAge: Duration): Promise<boolean> {
    const stale = await this.staleFields(ref, fields, maxAge);
    return stale.length === 0;
  }
}
