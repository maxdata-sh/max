import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import type { ConfigManager } from './config-manager.js';
import type { StoredEntity, EntityQuery, QueryResult, Filter } from '../types/entity.js';
import type { EntitySchema } from '../types/connector.js';
import type { ContentBlob } from '../types/connector.js';
import type { FilterExpr } from '../types/filter.js';
import { BasicSqlFilterRenderer } from './filter/basic-sql-renderer.js';

export class EntityStore {
  private config: ConfigManager;
  private db: Database | null = null;

  constructor(config: ConfigManager) {
    this.config = config;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    const dbPath = this.config.getDatabasePath();
    this.db = new Database(dbPath);

    // Create tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS entities (
        source TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        properties TEXT NOT NULL,
        permissions TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        PRIMARY KEY (source, id)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(source, type)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_entities_synced ON entities(source, synced_at)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS schemas (
        source TEXT PRIMARY KEY,
        schema TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sync_state (
        source TEXT PRIMARY KEY,
        last_sync TEXT,
        cursor TEXT
      )
    `);
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Upsert a single entity
   */
  async upsert(entity: StoredEntity): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entities (source, id, type, properties, permissions, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entity.source,
      entity.id,
      entity.type,
      JSON.stringify(entity.properties),
      JSON.stringify(entity.permissions),
      entity.syncedAt.toISOString()
    );
  }

  /**
   * Upsert multiple entities in a batch
   */
  async upsertBatch(entities: StoredEntity[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entities (source, id, type, properties, permissions, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const entity of entities) {
        stmt.run(
          entity.source,
          entity.id,
          entity.type,
          JSON.stringify(entity.properties),
          JSON.stringify(entity.permissions),
          entity.syncedAt.toISOString()
        );
      }
    });

    transaction();
  }

  /**
   * Delete an entity
   */
  async delete(source: string, id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare('DELETE FROM entities WHERE source = ? AND id = ?').run(source, id);

    // Also delete content file if exists
    const contentPath = this.getContentPath(source, id);
    if (fs.existsSync(contentPath)) {
      fs.unlinkSync(contentPath);
    }
  }

  /**
   * Get a single entity by ID
   */
  async get(source: string, id: string): Promise<StoredEntity | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM entities WHERE source = ? AND id = ?').get(source, id) as {
      source: string;
      id: string;
      type: string;
      properties: string;
      permissions: string;
      synced_at: string;
    } | null;

    if (!row) return null;

    return this.rowToEntity(row);
  }

  /**
   * Query entities with filters
   */
  async query(query: EntityQuery): Promise<QueryResult> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM entities WHERE source = ?';
    const params: string[] = [query.source];

    if (query.type) {
      sql += ' AND type = ?';
      params.push(query.type);
    }

    // Get all matching entities first (we'll filter in memory for complex queries)
    const rows = this.db.prepare(sql).all(...params) as Array<{
      source: string;
      id: string;
      type: string;
      properties: string;
      permissions: string;
      synced_at: string;
    }>;

    let entities = rows.map(row => this.rowToEntity(row));

    // Apply filters in memory (for JSON property access and glob patterns)
    if (query.filters && query.filters.length > 0) {
      entities = entities.filter(entity => this.matchesFilters(entity, query.filters!));
    }

    const total = entities.length;

    // Apply pagination
    if (query.offset) {
      entities = entities.slice(query.offset);
    }
    if (query.limit) {
      entities = entities.slice(0, query.limit);
    }

    return { entities, total };
  }

  /**
   * Query entities with a parsed filter expression.
   * Uses SQL-level filtering with json_extract for property access.
   */
  async queryWithFilter(options: {
    source: string;
    type?: string;
    filterExpr?: FilterExpr;
    allowedColumns?: string[];
    limit?: number;
    offset?: number;
  }): Promise<QueryResult> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM entities WHERE source = ?';
    const params: (string | number | bigint | boolean | null | Uint8Array)[] = [options.source];

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    // Apply filter expression if provided
    if (options.filterExpr && options.allowedColumns) {
      const renderer = new BasicSqlFilterRenderer();
      const filterResult = renderer.render(options.filterExpr, options.allowedColumns);
      sql += ` AND (${filterResult.sql})`;
      params.push(...filterResult.params as string[]);
    }

    // Get count for total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countRow = this.db.prepare(countSql).get(...params) as { count: number };
    const total = countRow.count;

    // Apply pagination at SQL level
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      source: string;
      id: string;
      type: string;
      properties: string;
      permissions: string;
      synced_at: string;
    }>;

    const entities = rows.map(row => this.rowToEntity(row));

    return { entities, total };
  }

  /**
   * Store content for an entity
   */
  async storeContent(source: string, id: string, content: ContentBlob): Promise<void> {
    const contentPath = this.getContentPath(source, id);
    const contentDir = path.dirname(contentPath);

    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }

    // Store metadata alongside content
    const metadata = {
      mimeType: content.mimeType,
      extractedAt: content.extractedAt.toISOString(),
    };

    fs.writeFileSync(contentPath, content.content);
    fs.writeFileSync(contentPath + '.meta.json', JSON.stringify(metadata));
  }

  /**
   * Get content for an entity
   */
  async getContent(source: string, id: string): Promise<ContentBlob | null> {
    const contentPath = this.getContentPath(source, id);
    const metaPath = contentPath + '.meta.json';

    if (!fs.existsSync(contentPath) || !fs.existsSync(metaPath)) {
      return null;
    }

    const content = fs.readFileSync(contentPath, 'utf-8');
    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    return {
      mimeType: metadata.mimeType,
      content,
      extractedAt: new Date(metadata.extractedAt),
    };
  }

  /**
   * Get schema for a source
   */
  getSchema(source: string): EntitySchema | null {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT schema FROM schemas WHERE source = ?').get(source) as { schema: string } | null;

    if (!row) return null;
    return JSON.parse(row.schema) as EntitySchema;
  }

  /**
   * Set schema for a source
   */
  async setSchema(schema: EntitySchema): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare('INSERT OR REPLACE INTO schemas (source, schema) VALUES (?, ?)').run(
      schema.source,
      JSON.stringify(schema)
    );
  }

  /**
   * Get content file path for an entity
   */
  private getContentPath(source: string, id: string): string {
    // Sanitize ID for filesystem
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.config.getContentDir(source), `${safeId}.txt`);
  }

  /**
   * Convert a database row to a StoredEntity
   */
  private rowToEntity(row: {
    source: string;
    id: string;
    type: string;
    properties: string;
    permissions: string;
    synced_at: string;
  }): StoredEntity {
    return {
      source: row.source,
      id: row.id,
      type: row.type,
      properties: JSON.parse(row.properties),
      permissions: JSON.parse(row.permissions),
      syncedAt: new Date(row.synced_at),
    };
  }

  /**
   * Check if an entity matches all filters
   */
  private matchesFilters(entity: StoredEntity, filters: Filter[]): boolean {
    for (const filter of filters) {
      const value = entity.properties[filter.field];

      switch (filter.op) {
        case '=':
          if (value !== filter.value) return false;
          break;
        case '!=':
          if (value === filter.value) return false;
          break;
        case '>':
          if (!(value as number > (filter.value as number))) return false;
          break;
        case '<':
          if (!(value as number < (filter.value as number))) return false;
          break;
        case '>=':
          if (!(value as number >= (filter.value as number))) return false;
          break;
        case '<=':
          if (!(value as number <= (filter.value as number))) return false;
          break;
        case 'like':
          // Treat as glob pattern
          if (typeof value !== 'string') return false;
          if (!minimatch(value, filter.value as string)) return false;
          break;
        case 'in':
          if (!Array.isArray(filter.value)) return false;
          if (!filter.value.includes(value)) return false;
          break;
      }
    }
    return true;
  }
}
