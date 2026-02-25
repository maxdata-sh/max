/**
 * @max/query-parser — Parse filter expressions into ASTs.
 *
 * @example
 * ```ts
 * import { parseFilter, lowerToFilters } from '@max/query-parser'
 *
 * const ast = parseFilter('name = Acme AND active = true')
 * const filters = lowerToFilters(ast)
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
export { lowerToFilters } from './lower.js'
export { coerceValue } from './coerce.js'
