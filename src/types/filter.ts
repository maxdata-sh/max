/**
 * Filter expression types for the pluggable filter parser.
 *
 * Grammar:
 *   expr       := term ((AND | OR) term)*
 *   term       := NOT? factor
 *   factor     := comparison | '(' expr ')'
 *   comparison := column operator value
 *   operator   := '=' | '!=' | '>' | '>=' | '<' | '<=' | '~='
 */

/**
 * AST node types for filter expressions
 */
export type FilterExpr =
  | { type: 'comparison'; field: string; op: FilterOp; value: string }
  | { type: 'and'; left: FilterExpr; right: FilterExpr }
  | { type: 'or'; left: FilterExpr; right: FilterExpr }
  | { type: 'not'; expr: FilterExpr };

export type FilterOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | '~=';

/**
 * Parser interface - converts filter string to AST
 */
export interface IFilterParser {
  /**
   * Parse a filter string into an AST
   * @param input - The filter string (e.g., "name=foo AND state=open")
   * @param columns - Valid column names for validation
   * @throws Error if parsing fails
   */
  parse(input: string, columns: string[]): FilterExpr;
}

/**
 * Renderer result for SQL-based rendering
 */
export interface SqlFilterResult {
  sql: string;
  params: unknown[];
}

/**
 * Renderer interface - converts AST to executable form
 */
export interface IFilterRenderer<T> {
  /**
   * Render a filter AST to an executable form
   * @param expr - The filter AST
   * @param allowedColumns - Columns allowed in the filter (for validation)
   */
  render(expr: FilterExpr, allowedColumns: string[]): T;
}

/**
 * Convenience type aliases
 */
export type ISqlFilterRenderer = IFilterRenderer<SqlFilterResult>;
export type IPredicateFilterRenderer = IFilterRenderer<(entity: Record<string, unknown>) => boolean>;
