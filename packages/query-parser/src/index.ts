/**
 * @max/query-parser — Parse filter expressions into ASTs and WhereClause trees.
 *
 * @example
 * ```ts
 * import { parseFilter, lowerToWhereClause } from '@max/query-parser'
 *
 * const ast = parseFilter('(name = Acme OR name = Beta) AND active = true')
 * const where = lowerToWhereClause(ast)
 * ```
 */

export type {
  FilterNode,
  ComparisonNode,
  LogicalNode,
  ValueLiteral,
  ComparisonOp,
} from './ast.js'

export { parseFilter } from './grammar.js'
export { lowerToWhereClause, lowerToFilters } from './lower.js'
export { coerceValue } from './coerce.js'
