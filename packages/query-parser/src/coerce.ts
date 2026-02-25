/**
 * Value coercion for filter literals.
 *
 * Unquoted values are coerced to their natural type:
 *   "true" / "false" → boolean
 *   numeric strings   → number
 *   everything else   → string
 *
 * Quoted values are always kept as strings — the user's escape hatch.
 */

import type { ValueLiteral } from './ast.js'

export function coerceValue(literal: ValueLiteral): unknown {
  if (literal.quoted) return literal.raw

  const lower = literal.raw.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false

  const num = Number(literal.raw)
  if (literal.raw !== '' && !isNaN(num)) return num

  return literal.raw
}
