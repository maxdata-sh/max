/**
 * Intermediate representation mapping EntityDef to SQLite table structure.
 */

import type { EntityDefAny, FieldDef } from "@max/core";
import { toSnakeCase } from "./utils.js";

export type SqlType = "TEXT" | "INTEGER" | "REAL";

export interface ColumnDef {
  columnName: string;    // snake_case SQL column name
  fieldName: string;     // camelCase TypeScript field name
  sqlType: SqlType;
  isRef: boolean;        // true if this is a RefField (stores foreign ID)
  refTable?: string;     // target table name for RefFields
}

export interface TableDef {
  tableName: string;
  entityDef: EntityDefAny;
  columns: ColumnDef[];
}

/** Map a FieldDef to its SQL type */
function fieldToSqlType(field: FieldDef): SqlType {
  if (field.kind === "scalar") {
    switch (field.type) {
      case "string": return "TEXT";
      case "number": return "REAL";
      case "boolean": return "INTEGER";
      case "date": return "TEXT"; // ISO string
    }
  }
  if (field.kind === "ref") {
    return "TEXT"; // stores the ref ID
  }
  // collection fields are not stored as columns
  throw new Error(`Cannot map collection field to SQL type`);
}

/** Build a TableDef from an EntityDef */
export function buildTableDef(entityDef: EntityDefAny): TableDef {
  const tableName = toSnakeCase(entityDef.name);
  const columns: ColumnDef[] = [];

  for (const [fieldName, fieldDef] of Object.entries(entityDef.fields)) {
    // Skip collection fields - they're derived, not stored
    if (fieldDef.kind === "collection") {
      continue;
    }

    const columnName = toSnakeCase(fieldName);
    const sqlType = fieldToSqlType(fieldDef);
    const isRef = fieldDef.kind === "ref";
    const refTable = isRef ? toSnakeCase(fieldDef.target.name) : undefined;

    columns.push({ columnName, fieldName, sqlType, isRef, refTable });
  }

  return { tableName, entityDef, columns };
}

/** Generate CREATE TABLE SQL for a TableDef */
export function generateCreateTableSql(tableDef: TableDef): string {
  const columnDefs = [
    "id TEXT PRIMARY KEY",
    ...tableDef.columns.map(col => `${col.columnName} ${col.sqlType}`)
  ];

  return `CREATE TABLE IF NOT EXISTS ${tableDef.tableName} (${columnDefs.join(", ")})`;
}
