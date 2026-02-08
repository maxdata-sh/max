/**
 * @max/storage-sqlite - SQLite storage backend for Max
 */

export { SqliteEngine } from "./engine.js";
export { SqliteSchema } from "./schema.js";
export { SqliteQueryBuilder } from "./query-builder.js";
export { buildTableDef, generateCreateTableSql } from "./table-def.js";
export type { TableDef, ColumnDef, SqlType } from "./table-def.js";
export { toSnakeCase, toCamelCase } from "./utils.js";

// Errors
export { Storage, ErrEntityNotFound, ErrEntityNotRegistered, ErrFieldNotFound, ErrCollectionNotSupported, ErrInvalidFieldMapping } from "./errors.js";
