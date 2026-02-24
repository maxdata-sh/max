/**
 * AND-only filter expression parser.
 *
 * Parses filter strings like:
 *   "name=Acme"
 *   "name=Acme AND active=true"
 *   "priority>=2 AND status!=closed"
 *
 * Grammar:
 *   expr       := comparison (AND comparison)*
 *   comparison := field operator value
 *   operator   := = | != | > | >= | < | <= | ~=
 *
 * Produces QueryFilter[] from @max/core. The ~= operator maps to "contains".
 */

import type { QueryFilter } from '@max/core'
import { ErrFilterParse } from '../errors.js'

type FilterOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | '~='

const OP_PATTERN = /^(!=|>=|<=|>|<|~=|=)/

const CORE_OP_MAP: Record<FilterOp, QueryFilter['op']> = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  '~=': 'contains',
}

/**
 * Parse a filter string into QueryFilter[].
 *
 * @param input  Filter expression (e.g. "name=Acme AND active=true")
 * @param validFields  Allowed field names for validation
 */
export function parseFilter(input: string, validFields: string[]): QueryFilter[] {
  const tokens = tokenize(input)
  if (tokens.length === 0) return []

  const filters: QueryFilter[] = []
  let pos = 0

  const fail = (reason: string): never => {
    throw ErrFilterParse.create({ expression: input, reason })
  }

  filters.push(parseComparison())

  while (pos < tokens.length) {
    const tok = tokens[pos]
    if (tok.toUpperCase() !== 'AND') {
      fail(`Expected "AND" but got "${tok}"`)
    }
    pos++ // consume AND
    filters.push(parseComparison())
  }

  return filters

  function parseComparison(): QueryFilter {
    const token = tokens[pos]
    if (token === undefined) return fail('Unexpected end of filter expression')

    // Find which field this token matches
    for (const field of validFields) {
      // Case 1: token is exactly the field name → operator is next token(s)
      if (token === field) {
        pos++
        const next = tokens[pos]
        if (next === undefined) return fail(`Expected operator after "${field}"`)

        const opMatch = next.match(OP_PATTERN)
        if (!opMatch) return fail(`Expected operator after "${field}", got "${next}"`)

        pos++
        const op = opMatch[1] as FilterOp
        const valueAfterOp = next.slice(op.length)

        let value: string
        if (valueAfterOp) {
          value = valueAfterOp
        } else {
          if (tokens[pos] === undefined) return fail(`Expected value after "${op}"`)
          value = tokens[pos]
          pos++
        }

        return { field, op: CORE_OP_MAP[op], value }
      }

      // Case 2: token starts with field name + operator (e.g. "name=Acme")
      if (token.startsWith(field) && token.length > field.length) {
        const rest = token.slice(field.length)
        const opMatch = rest.match(OP_PATTERN)

        if (opMatch) {
          pos++
          const op = opMatch[1] as FilterOp
          let value = rest.slice(op.length)

          if (!value) {
            if (tokens[pos] === undefined) return fail(`Expected value after "${op}"`)
            value = tokens[pos]
            pos++
          }

          return { field, op: CORE_OP_MAP[op], value }
        }
      }
    }

    return fail(`Unknown field "${token}". Valid fields: ${validFields.join(', ')}`)
  }
}

// ============================================================================
// Tokenizer
// ============================================================================

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) { i++; continue }

    // Quoted string
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i]
      let value = ''
      i++ // skip opening quote
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++
          value += input[i] === 'n' ? '\n' : input[i] === 't' ? '\t' : input[i]
        } else {
          value += input[i]
        }
        i++
      }
      if (i < input.length) i++ // skip closing quote
      tokens.push(value)
      continue
    }

    // Word token
    let token = ''
    while (i < input.length && !/[\s"']/.test(input[i])) {
      token += input[i]
      i++
    }
    if (token) tokens.push(token)
  }

  return tokens
}
