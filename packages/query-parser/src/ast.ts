/**
 * AST types for parsed filter expressions.
 *
 * The parser produces this tree; downstream consumers (like `lowerToFilters`)
 * walk it to produce engine-specific representations.
 */

/** A value literal — carries the raw text and whether it was quoted. */
export type ValueLiteral = {
  readonly raw: string
  readonly quoted: boolean
}

/** Comparison operators recognised in the grammar. */
export type ComparisonOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | '~='

/** A single `field op value` comparison. */
export type ComparisonNode = {
  readonly type: 'comparison'
  readonly field: string
  readonly op: ComparisonOp
  readonly value: ValueLiteral
}

/** AND / OR logical connective joining two sub-expressions. */
export type LogicalNode = {
  readonly type: 'logical'
  readonly operator: 'AND' | 'OR'
  readonly left: FilterNode
  readonly right: FilterNode
}

/** The full filter AST — either a leaf comparison or a logical branch. */
export type FilterNode = ComparisonNode | LogicalNode
