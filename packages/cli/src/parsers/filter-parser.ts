/**
 * Filter parsing for the CLI — delegates to @max/query-parser.
 *
 * Parses a filter string into a WhereClause tree ready for the engine.
 * Field validation is done here at the CLI boundary since the parser
 * package is schema-agnostic.
 */

import { WhereClause } from '@max/core'
import type { QueryFilter } from '@max/core'
import { parseFilter as parseAst, lowerToWhereClause } from '@max/query-parser'
import { ErrFilterParse } from '../errors.js'

/**
 * Parse a filter string into a WhereClause.
 *
 * @param input  Filter expression (e.g. "(name=Acme OR name=Beta) AND active=true")
 * @param validFields  Allowed field names for validation
 */
export function parseFilter(input: string, validFields: string[]): WhereClause {
  if (!input.trim()) return WhereClause.empty

  const ast = parseAst(input)
  const clause = lowerToWhereClause(ast)

  // Validate field names against schema by walking the tree
  const fieldSet = new Set(validFields)
  validateFields(clause, fieldSet, input)

  return clause
}

function validateFields(clause: WhereClause, validFields: Set<string>, expression: string): void {
  if (WhereClause.isLeaf(clause)) {
    if (!validFields.has(clause.field)) {
      throw ErrFilterParse.create({
        expression,
        reason: `Unknown field "${clause.field}". Valid fields: ${[...validFields].join(', ')}`,
      })
    }
  } else {
    for (const child of clause.clauses) {
      validateFields(child, validFields, expression)
    }
  }
}
