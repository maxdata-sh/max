/**
 * Filter parsing for the CLI — delegates to @max/query-parser.
 *
 * Parses a filter string into QueryFilter[] ready for the engine.
 * Field validation is done here at the CLI boundary since the parser
 * package is schema-agnostic.
 */

import type { QueryFilter } from '@max/core'
import { parseFilter as parseAst, lowerToFilters } from '@max/query-parser'
import { ErrFilterParse } from '../errors.js'

/**
 * Parse a filter string into QueryFilter[].
 *
 * @param input  Filter expression (e.g. "name=Acme AND active=true")
 * @param validFields  Allowed field names for validation
 */
export function parseFilter(input: string, validFields: string[]): QueryFilter[] {
  if (!input.trim()) return []

  const ast = parseAst(input)
  const filters = lowerToFilters(ast, input)

  // Validate field names against schema
  const fieldSet = new Set(validFields)
  for (const f of filters) {
    if (!fieldSet.has(f.field)) {
      throw ErrFilterParse.create({
        expression: input,
        reason: `Unknown field "${f.field}". Valid fields: ${validFields.join(', ')}`,
      })
    }
  }

  return filters
}
