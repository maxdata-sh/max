/**
 * Lower a FilterNode AST into a WhereClause tree for the engine.
 *
 * Comparison nodes become QueryFilter leaves. AND/OR logical nodes
 * become WhereClause grouping nodes. The tree structure is preserved
 * so the engine can generate correct parenthesised SQL.
 */

import { WhereClause } from '@max/core'
import type { QueryFilter } from '@max/core'
import type { FilterNode } from './ast.js'
import { coerceValue } from './coerce.js'

const OP_MAP: Record<string, QueryFilter['op']> = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  '~=': 'contains',
}

/**
 * Walk the AST and produce a WhereClause tree.
 * Supports both AND and OR connectives.
 */
export function lowerToWhereClause(node: FilterNode): WhereClause {
  switch (node.type) {
    case 'comparison':
      return {
        field: node.field,
        op: OP_MAP[node.op] ?? node.op,
        value: coerceValue(node.value),
      } satisfies QueryFilter

    case 'logical': {
      const left = lowerToWhereClause(node.left)
      const right = lowerToWhereClause(node.right)
      return node.operator === 'AND'
        ? WhereClause.and(left, right)
        : WhereClause.or(left, right)
    }
  }
}

/**
 * @deprecated Use `lowerToWhereClause` instead.
 * Flattens an AND-only AST into QueryFilter[]. Throws on OR.
 */
export function lowerToFilters(node: FilterNode, _originalExpression?: string): QueryFilter[] {
  const clause = lowerToWhereClause(node)
  return flattenAndOnly(clause)
}

function flattenAndOnly(clause: WhereClause): QueryFilter[] {
  if (WhereClause.isLeaf(clause)) return [clause]
  if (clause.kind === 'or') {
    // Legacy path — callers that still use lowerToFilters can't handle OR
    throw new Error('OR is not supported by lowerToFilters — use lowerToWhereClause instead')
  }
  return clause.clauses.flatMap(flattenAndOnly)
}
