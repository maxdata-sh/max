/**
 * Lower a FilterNode AST into QueryFilter[] for the current engine.
 *
 * AND nodes flatten into the array. OR nodes throw — the engine
 * doesn't support disjunction yet.
 */

import type { QueryFilter } from '@max/core'
import type { FilterNode } from './ast.js'
import { coerceValue } from './coerce.js'
import { ErrOrNotSupported } from './errors.js'

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
 * Walk the AST and produce a flat QueryFilter[].
 * Only AND-connected trees are supported.
 */
export function lowerToFilters(node: FilterNode, originalExpression?: string): QueryFilter[] {
  switch (node.type) {
    case 'comparison':
      return [{
        field: node.field,
        op: OP_MAP[node.op] ?? node.op,
        value: coerceValue(node.value),
      }]

    case 'logical':
      if (node.operator === 'OR') {
        throw ErrOrNotSupported.create({
          expression: originalExpression ?? '<unknown>',
        })
      }
      return [
        ...lowerToFilters(node.left, originalExpression),
        ...lowerToFilters(node.right, originalExpression),
      ]
  }
}
