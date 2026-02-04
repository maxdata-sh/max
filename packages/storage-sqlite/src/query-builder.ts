/**
 * SqliteQueryBuilder - builds and executes SQL queries.
 */

import type { Database } from "bun:sqlite";
import {
  type QueryBuilder,
  type EntityDefAny,
  type EntityResult,
  type EntityFields,
  type Ref,
  RefOf,
  EntityResultOf,
} from "@max/core";
import type { TableDef, ColumnDef } from "./table-def.js";

type WhereClause = {
  column: string;
  op: string;
  value: unknown;
};

export class SqliteQueryBuilder<E extends EntityDefAny> implements QueryBuilder<E> {
  private whereClauses: WhereClause[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private orderByClause?: { column: string; dir: "ASC" | "DESC" };

  constructor(
    private db: Database,
    private tableDef: TableDef,
    private entityDef: E
  ) {}

  where<K extends keyof EntityFields<E>>(
    field: K,
    op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains",
    value: EntityFields<E>[K]
  ): QueryBuilder<E> {
    const col = this.getColumn(field as string);
    const sqlOp = op === "contains" ? "LIKE" : op;
    const sqlValue = op === "contains" ? `%${value}%` : this.toSqlValue(value, col);

    this.whereClauses.push({ column: col.columnName, op: sqlOp, value: sqlValue });
    return this;
  }

  limit(n: number): QueryBuilder<E> {
    this.limitValue = n;
    return this;
  }

  offset(n: number): QueryBuilder<E> {
    this.offsetValue = n;
    return this;
  }

  orderBy<K extends keyof EntityFields<E>>(field: K, dir: "asc" | "desc" = "asc"): QueryBuilder<E> {
    const col = this.getColumn(field as string);
    this.orderByClause = { column: col.columnName, dir: dir.toUpperCase() as "ASC" | "DESC" };
    return this;
  }

  async refs(): Promise<Ref<E>[]> {
    const sql = this.buildSql(["id"]);
    const rows = this.db.query(sql.query).all(...sql.params) as { id: string }[];
    return rows.map(row => RefOf.indirect(this.entityDef, row.id));
  }

  async select<K extends keyof EntityFields<E>>(...fields: K[]): Promise<EntityResult<E, K>[]> {
    const columns = fields.map(f => this.getColumn(f as string));
    const columnNames = ["id", ...columns.map(c => c.columnName)];

    const sql = this.buildSql(columnNames);
    const rows = this.db.query(sql.query).all(...sql.params) as Record<string, unknown>[];

    return rows.map(row => {
      const ref = RefOf.indirect(this.entityDef, row.id as string);
      const data: Record<string, unknown> = {};

      for (const col of columns) {
        data[col.fieldName] = this.fromSqlValue(row[col.columnName], col);
      }

      return EntityResultOf.from(ref, data as { [P in K]: EntityFields<E>[P] });
    });
  }

  async selectAll(): Promise<EntityResult<E, keyof EntityFields<E>>[]> {
    const columns = this.tableDef.columns;
    const columnNames = ["id", ...columns.map(c => c.columnName)];

    const sql = this.buildSql(columnNames);
    const rows = this.db.query(sql.query).all(...sql.params) as Record<string, unknown>[];

    return rows.map(row => {
      const ref = RefOf.indirect(this.entityDef, row.id as string);
      const data: Record<string, unknown> = {};

      for (const col of columns) {
        data[col.fieldName] = this.fromSqlValue(row[col.columnName], col);
      }

      return EntityResultOf.from(ref, data as { [P in keyof EntityFields<E>]: EntityFields<E>[P] });
    });
  }

  private buildSql(columns: string[]): { query: string; params: unknown[] } {
    let query = `SELECT ${columns.join(", ")} FROM ${this.tableDef.tableName}`;
    const params: unknown[] = [];

    if (this.whereClauses.length > 0) {
      const whereConditions = this.whereClauses.map(w => {
        params.push(w.value);
        return `${w.column} ${w.op} ?`;
      });
      query += ` WHERE ${whereConditions.join(" AND ")}`;
    }

    if (this.orderByClause) {
      query += ` ORDER BY ${this.orderByClause.column} ${this.orderByClause.dir}`;
    }

    if (this.limitValue !== undefined) {
      query += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue !== undefined) {
      query += ` OFFSET ${this.offsetValue}`;
    }

    return { query, params };
  }

  private getColumn(fieldName: string): ColumnDef {
    const col = this.tableDef.columns.find(c => c.fieldName === fieldName);
    if (!col) {
      throw new Error(`Field '${fieldName}' not found on ${this.entityDef.name}`);
    }
    return col;
  }

  private toSqlValue(value: unknown, col: ColumnDef): unknown {
    if (col.isRef) {
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

  private fromSqlValue(value: unknown, col: ColumnDef): unknown {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (col.isRef) {
      const fieldDef = this.entityDef.fields[col.fieldName];
      if (fieldDef.kind === "ref") {
        return RefOf.indirect(fieldDef.target, value as string);
      }
    }

    if (col.sqlType === "INTEGER") {
      const fieldDef = this.entityDef.fields[col.fieldName];
      if (fieldDef.kind === "scalar" && fieldDef.type === "boolean") {
        return value === 1;
      }
    }

    if (col.sqlType === "TEXT") {
      const fieldDef = this.entityDef.fields[col.fieldName];
      if (fieldDef.kind === "scalar" && fieldDef.type === "date") {
        return new Date(value as string);
      }
    }

    return value;
  }
}
