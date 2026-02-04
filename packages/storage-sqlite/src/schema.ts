/**
 * SqliteSchema - registry of entity definitions and their table mappings.
 */

import type { Database } from "bun:sqlite";
import type { EntityDefAny } from "@max/core";
import { buildTableDef, generateCreateTableSql, type TableDef } from "./table-def.js";

export class SqliteSchema {
  private tables = new Map<string, TableDef>();

  /** Register an entity definition */
  register(entityDef: EntityDefAny): this {
    const tableDef = buildTableDef(entityDef);
    this.tables.set(entityDef.name, tableDef);
    return this;
  }

  /** Get the TableDef for an entity definition */
  getTable(entityDef: EntityDefAny): TableDef {
    const tableDef = this.tables.get(entityDef.name);
    if (!tableDef) {
      throw new Error(`Entity '${entityDef.name}' not registered in schema`);
    }
    return tableDef;
  }

  /** Create all registered tables in the database */
  ensureTables(db: Database): void {
    for (const tableDef of this.tables.values()) {
      const sql = generateCreateTableSql(tableDef);
      db.run(sql);
    }
  }

  /** Get all registered TableDefs */
  allTables(): TableDef[] {
    return Array.from(this.tables.values());
  }
}
