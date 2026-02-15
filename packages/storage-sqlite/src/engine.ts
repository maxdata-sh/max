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
  type FieldsAll,
  type FieldsSelect,
  type Page,
  type PageRequest,
  Ref,
  type CollectionKeys,
  type CollectionTargetRef,
  type EntityId,
  type Schema,
  LifecycleManager,
} from "@max/core";
import { SqliteSchema } from "./schema.js";
import type { TableDef, ColumnDef } from "./table-def.js";
import { SqliteQueryBuilder } from "./query-builder.js";
import { ErrEntityNotFound, ErrFieldNotFound, ErrCollectionNotSupported } from "./errors.js";

export class SqliteEngine implements Engine {
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
    return Ref.local(input.ref.entityDef, id as EntityId);
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

  query<E extends EntityDefAny>(def: E): SqliteQueryBuilder<E> {
    return new SqliteQueryBuilder(this.db, this.schema.getTable(def), def);
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
        return Ref.local(fieldDef.target, value as EntityId);
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
