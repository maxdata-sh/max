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

/** A token with metadata about whether it was quoted in the input. */
interface Token {
  text: string
  quoted: boolean
}

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
 * Coerce an unquoted string value to its natural type.
 * Quoted values are always kept as strings (user's escape hatch).
 */
function coerceValue(token: Token): unknown {
  if (token.quoted) return token.text

  const lower = token.text.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false

  const num = Number(token.text)
  if (token.text !== '' && !isNaN(num)) return num

  return token.text
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
    if (tok.text.toUpperCase() !== 'AND') {
      fail(`Expected "AND" but got "${tok.text}"`)
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
      if (token.text === field) {
        pos++
        const next = tokens[pos]
        if (next === undefined) return fail(`Expected operator after "${field}"`)

        const opMatch = next.text.match(OP_PATTERN)
        if (!opMatch) return fail(`Expected operator after "${field}", got "${next.text}"`)

        pos++
        const op = opMatch[1] as FilterOp
        const valueAfterOp = next.text.slice(op.length)

        let valueToken: Token
        if (valueAfterOp) {
          // Value was glued to operator (e.g. "=Acme") — inherits quoted from original token
          valueToken = { text: valueAfterOp, quoted: next.quoted }
        } else {
          if (tokens[pos] === undefined) return fail(`Expected value after "${op}"`)
          valueToken = tokens[pos]
          pos++
        }

        return { field, op: CORE_OP_MAP[op], value: coerceValue(valueToken) }
      }

      // Case 2: token starts with field name + operator (e.g. "name=Acme")
      if (token.text.startsWith(field) && token.text.length > field.length) {
        const rest = token.text.slice(field.length)
        const opMatch = rest.match(OP_PATTERN)

        if (opMatch) {
          pos++
          const op = opMatch[1] as FilterOp
          const valueAfterOp = rest.slice(op.length)

          let valueToken: Token
          if (valueAfterOp) {
            // Combined token like "name=Acme" — never quoted (quotes would have split it)
            valueToken = { text: valueAfterOp, quoted: false }
          } else {
            if (tokens[pos] === undefined) return fail(`Expected value after "${op}"`)
            valueToken = tokens[pos]
            pos++
          }

          return { field, op: CORE_OP_MAP[op], value: coerceValue(valueToken) }
        }
      }
    }

    return fail(`Unknown field "${token.text}". Valid fields: ${validFields.join(', ')}`)
  }
}

// ============================================================================
// Tokenizer
// ============================================================================

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
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
      tokens.push({ text: value, quoted: true })
      continue
    }

    // Word token
    let token = ''
    while (i < input.length && !/[\s"']/.test(input[i])) {
      token += input[i]
      i++
    }
    if (token) tokens.push({ text: token, quoted: false })
  }

  return tokens
}
