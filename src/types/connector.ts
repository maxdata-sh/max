import type { StoredEntity } from './entity.js';

export interface EntitySchema {
  source: string;
  entities: EntityDefinition[];
}

export interface EntityDefinition {
  type: string;
  fields: FieldDefinition[];
  relationships: RelationshipDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'datetime' | 'json';
  filterable: boolean;
  description?: string;
}

export interface RelationshipDefinition {
  name: string;
  targetType: string | string[];
  cardinality: 'one' | 'many';
}

export interface SyncOptions {
  since?: Date;
  types?: string[];
  paths?: string[];
}

export interface RawEntity {
  id: string;
  type: string;
  sourceType: string;
  properties: Record<string, unknown>;
  permissions: SourcePermission[];
  raw: unknown;
}

export interface SourcePermission {
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'writer' | 'reader';
  email?: string;
  domain?: string;
}

export interface ContentBlob {
  mimeType: string;
  content: string;
  extractedAt: Date;
}

// Flexible credentials - each connector defines its own shape
export interface Credentials {
  [key: string]: unknown
}

export interface Connector {
  readonly type: string;
  readonly schema: EntitySchema;

  authenticate(): Promise<Credentials>;
  sync(options?: SyncOptions): AsyncIterable<RawEntity>;
  get(id: string): Promise<RawEntity | null>;
  getContent(id: string): Promise<ContentBlob | null>;

  /**
   * Format an entity for text display.
   * Each connector knows best how to display its own entities.
   */
  formatEntity(entity: StoredEntity): string;
}
