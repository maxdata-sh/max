/**
 * SQL renderer for filter expressions.
 *
 * Renders FilterExpr AST to parameterized SQL WHERE clauses.
 * Uses json_extract for property access since entity properties
 * are stored as JSON blobs in SQLite.
 */

import type { ISqlFilterRenderer, FilterExpr, SqlFilterResult, FilterOp } from '../../types/filter.js';

export type FieldMapper = (field: string) => string;

/**
 * Default field mapper that uses json_extract for property access.
 */
export const jsonExtractFieldMapper: FieldMapper = (field: string) =>
  `json_extract(properties, '$.${field}')`;

export class BasicSqlFilterRenderer implements ISqlFilterRenderer {
  private fieldMapper: FieldMapper;

  constructor(fieldMapper: FieldMapper = jsonExtractFieldMapper) {
    this.fieldMapper = fieldMapper;
  }

  render(expr: FilterExpr, allowedColumns: string[]): SqlFilterResult {
    return this.renderExpr(expr, allowedColumns);
  }

  private renderExpr(expr: FilterExpr, allowedColumns: string[]): SqlFilterResult {
    switch (expr.type) {
      case 'comparison': {
        if (!allowedColumns.includes(expr.field)) {
          throw new Error(`Invalid column: ${expr.field}`);
        }
        return this.renderComparison(expr.field, expr.op, expr.value);
      }

      case 'and': {
        const left = this.renderExpr(expr.left, allowedColumns);
        const right = this.renderExpr(expr.right, allowedColumns);
        return {
          sql: `(${left.sql}) AND (${right.sql})`,
          params: [...left.params, ...right.params],
        };
      }

      case 'or': {
        const left = this.renderExpr(expr.left, allowedColumns);
        const right = this.renderExpr(expr.right, allowedColumns);
        return {
          sql: `(${left.sql}) OR (${right.sql})`,
          params: [...left.params, ...right.params],
        };
      }

      case 'not': {
        const inner = this.renderExpr(expr.expr, allowedColumns);
        return {
          sql: `NOT (${inner.sql})`,
          params: inner.params,
        };
      }
    }
  }

  private renderComparison(field: string, op: FilterOp, value: string): SqlFilterResult {
    const sqlField = this.fieldMapper(field);

    switch (op) {
      case '=':
        return { sql: `${sqlField} = ?`, params: [value] };
      case '!=':
        return { sql: `${sqlField} != ?`, params: [value] };
      case '>':
        return { sql: `${sqlField} > ?`, params: [value] };
      case '>=':
        return { sql: `${sqlField} >= ?`, params: [value] };
      case '<':
        return { sql: `${sqlField} < ?`, params: [value] };
      case '<=':
        return { sql: `${sqlField} <= ?`, params: [value] };
      case '~=':
        // Translate * to % and ? to _ for SQL LIKE
        const likePattern = value.replace(/\*/g, '%').replace(/\?/g, '_');
        return { sql: `${sqlField} LIKE ?`, params: [likePattern] };
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }
}
