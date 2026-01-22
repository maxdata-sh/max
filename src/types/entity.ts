import type { NormalizedPermission } from './permissions.js';

export interface StoredEntity {
  source: string;
  id: string;
  type: string;
  properties: Record<string, unknown>;
  permissions: NormalizedPermission[];
  syncedAt: Date;
}

export interface EntityQuery {
  source: string;
  type?: string;
  filters?: Filter[];
  limit?: number;
  offset?: number;
}

export interface Filter {
  field: string;
  op: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'in';
  value: unknown;
}

export interface QueryResult {
  entities: StoredEntity[];
  total: number;
}
