/**
 * SqliteEngine - Engine implementation backed by SQLite.
 */

import { Database, type SQLQueryBindings } from "bun:sqlite";
import {
  type Engine,
  type EntityDefAny,
  type EntityInput,
  EntityResult,
  type EntityFields,
  type EntityQuery,
  type FieldsAll,
  type FieldsSelect,
  Page,
  PageRequest,
  type Projection,
  Ref,
  type CollectionKeys,
  type CollectionTargetRef,
  type EntityId,
  type Schema,
  LifecycleManager,
  InstallationScope,
  type SelectProjection,
  type RefsProjection,
  type AllProjection,
  type EntityFieldsPick,
  RefKey,
  EntityFieldsKeys,
} from '@max/core'
import { SqliteSchema } from "./schema.js";
import type { TableDef, ColumnDef } from "./table-def.js";
import { ErrEntityNotFound, ErrFieldNotFound, ErrCollectionNotSupported } from "./errors.js";

export class SqliteEngine implements Engine<InstallationScope> {
  readonly db: Database;
  private schema: SqliteSchema;

  lifecycle = LifecycleManager.on({
    stop: () => { this.db.close(); },
  });

  constructor(db: Database, schema: SqliteSchema) {
    this.db = db;
    this.schema = schema;
  }

  /** Open a SQLite DB at `path`, register the schema, ensure tables, and return the engine. */
  static open(path: string, schema: Schema): SqliteEngine {
    const db = new Database(path, { create: true });
    const sqliteSchema = new SqliteSchema().registerSchema(schema);
    sqliteSchema.ensureTables(db);
    return new SqliteEngine(db, sqliteSchema);
  }

  async store<E extends EntityDefAny>(input: EntityInput<E>): Promise<Ref<E>> {
    const tableDef = this.schema.getTable(input.ref.entityDef);
    const id = input.ref.id;

    // Build column names and values
    const columnNames: string[] = ["id"];
    const placeholders: string[] = ["?"];
    const values: SQLQueryBindings[] = [id];

    for (const col of tableDef.columns) {
      const fieldValue = (input.fields as Record<string, unknown>)[col.fieldName];
      if (fieldValue === undefined) {
        continue;
      }

      columnNames.push(col.columnName);
      placeholders.push("?");
      values.push(this.toSqlValue(fieldValue, col) as SQLQueryBindings);
    }

    // Upsert: INSERT OR REPLACE
    const sql = `INSERT OR REPLACE INTO ${tableDef.tableName} (${columnNames.join(", ")}) VALUES (${placeholders.join(", ")})`;
    this.db.run(sql, values);

    // Return a local ref (it now exists in DB)
    return Ref.installation(input.ref.entityDef, id as EntityId);
  }

  async load<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K>
  ): Promise<EntityResult<E, K>>;

  async load<E extends EntityDefAny>(
    ref: Ref<E>,
    fields: FieldsAll | "*"
  ): Promise<EntityResult<E, keyof EntityFields<E>>>;

  async load<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    fields: FieldsSelect<E, K> | FieldsAll | "*"
  ): Promise<EntityResult<E, K>> {
    const tableDef = this.schema.getTable(ref.entityDef);

    // Determine which columns to select
    let columnsToLoad: ColumnDef[];
    if (fields === "*" || (typeof fields === "object" && fields.kind === "all")) {
      columnsToLoad = tableDef.columns;
    } else {
      const fieldNames = new Set(fields.fields as string[]);
      columnsToLoad = tableDef.columns.filter(col => fieldNames.has(col.fieldName));
    }

    const columnList = columnsToLoad.map(c => c.columnName).join(", ");
    const sql = `SELECT ${columnList} FROM ${tableDef.tableName} WHERE id = ?`;
    const row = this.db.query(sql).get(ref.id) as Record<string, unknown> | null;

    if (!row) {
      throw ErrEntityNotFound.create({ entityType: ref.entityType, entityId: ref.id });
    }

    // Convert row to field values
    const data: Record<string, unknown> = {};
    for (const col of columnsToLoad) {
      data[col.fieldName] = this.fromSqlValue(row[col.columnName], col, ref.entityDef);
    }

    return EntityResult.from(ref, data as { [P in K]: EntityFields<E>[P] });
  }

  async loadField<E extends EntityDefAny, K extends keyof EntityFields<E>>(
    ref: Ref<E>,
    field: K
  ): Promise<EntityFields<E>[K]> {
    const tableDef = this.schema.getTable(ref.entityDef);
    const col = tableDef.columns.find(c => c.fieldName === field);
    if (!col) {
      throw ErrFieldNotFound.create({ entityType: ref.entityType, field: String(field) });
    }

    const sql = `SELECT ${col.columnName} FROM ${tableDef.tableName} WHERE id = ?`;
    const row = this.db.query(sql).get(ref.id) as Record<string, unknown> | null;

    if (!row) {
      throw ErrEntityNotFound.create({ entityType: ref.entityType, entityId: ref.id });
    }

    return this.fromSqlValue(row[col.columnName], col, ref.entityDef) as EntityFields<E>[K];
  }

  async loadCollection<E extends EntityDefAny, K extends CollectionKeys<E>>(
    _ref: Ref<E>,
    _field: K,
    _options?: PageRequest
  ): Promise<Page<CollectionTargetRef<E, K>>> {
    throw ErrCollectionNotSupported.create({});
  }

  // loadPage overload signatures
  loadPage<E extends EntityDefAny>(
    def: E,
    projection: RefsProjection,
    page?: PageRequest
  ): Promise<Page<Ref<E>>>;

  loadPage<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    def: E,
    projection: SelectProjection<E,K>,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, K>>>;

  loadPage<E extends EntityDefAny>(
    def: E,
    projection: AllProjection,
    page?: PageRequest
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>;

  // loadPage implementation
  async loadPage<E extends EntityDefAny>(
    def: E,
    projection: Projection,
    page?: PageRequest
  ): Promise<Page<unknown>> {
    const tableDef = this.schema.getTable(def);
    const r = PageRequest.from(page).defaultLimit(1000);

    // Determine columns based on projection
    let columns: ColumnDef[];
    let columnNames: string[];

    switch (projection.kind) {
      case "refs":
        columns = [];
        columnNames = ["id"];
        break;
      case "select":
        columns = projection.fields.map(f => this.getColumn(tableDef, def, f));
        columnNames = ["id", ...columns.map(c => c.columnName)];
        break;
      case "all":
        columns = tableDef.columns;
        columnNames = ["id", ...columns.map(c => c.columnName)];
        break;
    }

    // Cursor-based: WHERE id > cursor ORDER BY id
    let sql = `SELECT ${columnNames.join(", ")} FROM ${tableDef.tableName}`;
    const params: SQLQueryBindings[] = [];

    if (r.cursor) {
      const parsed = RefKey.parse(r.cursor as RefKey);
      sql += ` WHERE id > ?`;
      params.push(parsed.entityId);
    }

    sql += ` ORDER BY id ASC LIMIT ${r.fetchSize}`;
    const rows = this.db.query(sql).all(...params) as Record<string, unknown>[];

    switch (projection.kind) {
      case "refs": {
        const items = rows.map(row => Ref.installation(def, row.id as EntityId));
        return this.toCursorPage(items, r.limit, ref => ref.toKey() as string);
      }
      case "select":
      case "all": {
        const items = rows.map(row => {
          const ref = Ref.installation(def, row.id as EntityId);
          const data: Record<string, unknown> = {};
          for (const col of columns) {
            data[col.fieldName] = this.fromSqlValue(row[col.columnName], col, def);
          }
          return EntityResult.from(ref, data as any);
        });
        return this.toCursorPage(items, r.limit, result => result.ref.toKey() as string);
      }
    }
  }

  // Overload signatures
  query<E extends EntityDefAny, K extends EntityFieldsKeys<E>>(
    query: EntityQuery<E, SelectProjection<E,K>>
  ): Promise<Page<EntityResult<E, K>>>;

  query<E extends EntityDefAny>(
    query: EntityQuery<E, RefsProjection>
  ): Promise<Page<Ref<E>>>;

  query<E extends EntityDefAny>(
    query: EntityQuery<E, AllProjection>
  ): Promise<Page<EntityResult<E, EntityFieldsKeys<E>>>>;

  // Implementation
  async query<E extends EntityDefAny>(
    query: EntityQuery<E>
  ): Promise<Page<unknown>> {
    const tableDef = this.schema.getTable(query.def);
    const { projection } = query;

    // Determine columns to select based on projection
    let columns: ColumnDef[];
    let columnNames: string[];

    switch (projection.kind) {
      case "refs":
        columns = [];
        columnNames = ["id"];
        break;
      case "select":
        columns = projection.fields.map(f => this.getColumn(tableDef, query.def, f));
        columnNames = ["id", ...columns.map(c => c.columnName)];
        break;
      case "all":
        columns = tableDef.columns;
        columnNames = ["id", ...columns.map(c => c.columnName)];
        break;
    }

    // Build SQL
    const { sql, params } = this.buildQuerySql(tableDef, query, columnNames);
    const rows = this.db.query(sql).all(...params) as Record<string, unknown>[];

    // Map rows to results based on projection
    switch (projection.kind) {
      case "refs": {
        const items = rows.map(row =>
          Ref.installation(query.def, row.id as EntityId)
        );
        return this.toCursorPage(items, query.limit, ref => ref.toKey() as string);
      }
      case "select": // fallthrough
      case "all": {
        const items = rows.map(row => {
          const ref = Ref.installation(query.def, row.id as EntityId);
          const data: Record<string,unknown> = {};
          for (const col of columns) {
            data[col.fieldName] = this.fromSqlValue(row[col.columnName], col, query.def);
          }
          return EntityResult.from(ref, data as EntityFieldsPick<E, string>)
        });
        return this.toCursorPage(items, query.limit, result => result.ref.toKey() as string);
      }
    }
  }

  /** Build SQL query string from an EntityQuery descriptor. */
  private buildQuerySql<E extends EntityDefAny>(
    tableDef: TableDef,
    query: EntityQuery<E>,
    columnNames: string[],
  ): { sql: string; params: SQLQueryBindings[] } {
    let sql = `SELECT ${columnNames.join(", ")} FROM ${tableDef.tableName}`;
    const params: SQLQueryBindings[] = [];
    const conditions: string[] = [];

    // User-defined filters
    for (const f of query.filters) {
      const col = this.getColumn(tableDef, query.def, f.field);
      const sqlOp = f.op === "contains" ? "LIKE" : f.op;
      const sqlValue = f.op === "contains"
        ? `%${f.value}%`
        : this.toSqlValue(f.value, col);
      params.push(sqlValue as SQLQueryBindings);
      conditions.push(`${col.columnName} ${sqlOp} ?`);
    }

    // Cursor-based pagination: WHERE id > cursor (cursor is a RefKey)
    if (query.cursor) {
      const parsed = RefKey.parse(query.cursor as RefKey);
      params.push(parsed.entityId);
      conditions.push(`id > ?`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // ORDER BY: user ordering first, then id as tiebreaker for stable cursor pagination
    const orderParts: string[] = [];
    if (query.ordering) {
      const col = this.getColumn(tableDef, query.def, query.ordering.field);
      orderParts.push(`${col.columnName} ${query.ordering.dir.toUpperCase()}`);
    }
    orderParts.push("id ASC");
    sql += ` ORDER BY ${orderParts.join(", ")}`;

    if (query.limit !== undefined) {
      // Fetch one extra for the "has more" pattern
      sql += ` LIMIT ${query.limit + 1}`;
    }

    return { sql, params };
  }

  /**
   * Wrap items into a cursor-based Page using the limit+1 pattern.
   * Cursor is extracted from the last item in the trimmed page via getCursor.
   */
  private toCursorPage<T>(items: T[], limit: number | undefined, getCursor: (item: T) => string): Page<T> {
    if (limit === undefined) {
      return Page.from(items, false);
    }
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const cursor = hasMore && pageItems.length > 0
      ? getCursor(pageItems[pageItems.length - 1])
      : undefined;
    return Page.from(pageItems, hasMore, cursor);
  }

  /** Look up a ColumnDef by field name, throwing if not found. */
  private getColumn(tableDef: TableDef, entityDef: EntityDefAny, fieldName: string): ColumnDef {
    const col = tableDef.columns.find(c => c.fieldName === fieldName);
    if (!col) {
      throw ErrFieldNotFound.create({ entityType: entityDef.name, field: fieldName });
    }
    return col;
  }

  /** Convert a TypeScript value to SQL-compatible value */
  private toSqlValue(value: unknown, col: ColumnDef): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (col.isRef) {
      // Ref field: store the id
      return (value as Ref<EntityDefAny>).id;
    }

    if (col.sqlType === "INTEGER" && typeof value === "boolean") {
      return value ? 1 : 0;
    }

    if (col.sqlType === "TEXT" && value instanceof Date) {
      return value.toISOString();
    }

    return value;
  }

  /** Convert a SQL value back to TypeScript value */
  private fromSqlValue(value: unknown, col: ColumnDef, entityDef: EntityDefAny): unknown {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (col.isRef) {
      // Ref field: reconstruct the Ref
      const fieldDef = entityDef.fields[col.fieldName];
      if (fieldDef.kind === "ref") {
        return Ref.installation(fieldDef.target, value as EntityId);
      }
    }

    if (col.sqlType === "INTEGER") {
      // Check if this is actually a boolean field
      const fieldDef = entityDef.fields[col.fieldName];
      if (fieldDef.kind === "scalar" && fieldDef.type === "boolean") {
        return value === 1;
      }
    }

    if (col.sqlType === "TEXT") {
      const fieldDef = entityDef.fields[col.fieldName];
      if (fieldDef.kind === "scalar" && fieldDef.type === "date") {
        return new Date(value as string);
      }
    }

    return value;
  }
}
