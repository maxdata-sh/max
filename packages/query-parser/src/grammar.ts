/**
 * Arcsecond grammar for filter expressions.
 *
 * Grammar:
 *   expression := factor ((AND | OR) factor)*
 *   factor     := '(' expression ')' | comparison
 *   comparison := field operator value
 *   operator   := '!=' | '>=' | '<=' | '~=' | '=' | '>' | '<'
 *   value      := quotedString | unquotedValue
 *   field      := identifier
 */

import {
  str,
  char,
  choice,
  many,
  sequenceOf,
  coroutine,
  between,
  recursiveParser,
  optionalWhitespace,
  whitespace,
  regex,
  type Parser,
} from 'arcsecond'

import type { FilterNode, ComparisonOp, ValueLiteral } from './ast.js'
import { ErrQueryParse } from './errors.js'

// ============================================================================
// Atoms
// ============================================================================

/** Quoted string: "..." or '...' with backslash escapes. */
const doubleQuotedString = sequenceOf([
  char('"'),
  many(choice([
    str('\\"').map(() => '"'),
    str('\\n').map(() => '\n'),
    str('\\t').map(() => '\t'),
    str('\\\\').map(() => '\\'),
    regex(/^[^"\\]/),
  ])),
  char('"'),
]).map(([, chars]): ValueLiteral => ({ raw: chars.join(''), quoted: true }))

const singleQuotedString = sequenceOf([
  char("'"),
  many(choice([
    str("\\'").map(() => "'"),
    str('\\n').map(() => '\n'),
    str('\\t').map(() => '\t'),
    str('\\\\').map(() => '\\'),
    regex(/^[^'\\]/),
  ])),
  char("'"),
]).map(([, chars]): ValueLiteral => ({ raw: chars.join(''), quoted: true }))

const quotedString = choice([doubleQuotedString, singleQuotedString])

/** Identifier: field names (letters, digits, underscores, starts with letter/_). */
const identifier = regex(/^[a-zA-Z_][a-zA-Z0-9_\-.]*/)

/** Unquoted value: permissive (can start with digits for numbers like -1, 3.5). */
const unquotedValue = regex(/^[a-zA-Z0-9_\-.:@]+/).map(
  (raw): ValueLiteral => ({ raw, quoted: false })
)

/** A value: quoted string or unquoted word. */
const value = choice([quotedString, unquotedValue])

/** Comparison operators, longest-first to avoid prefix ambiguity. */
const operator = choice([
  str('!='), str('>='), str('<='), str('~='),
  str('='), str('>'), str('<'),
])

/** Logical connectives (case-insensitive). Normalised to uppercase in the AST. */
const logicalOp = choice([
  str('AND'), str('and'),
  str('OR'), str('or'),
]).map(s => s.toUpperCase())

// ============================================================================
// Grammar
// ============================================================================

/** A comparison: field op value */
const comparison = coroutine(run => {
  const field: string = run(identifier)
  run(optionalWhitespace)
  const op: string = run(operator)
  run(optionalWhitespace)
  const val: ValueLiteral = run(value)

  return {
    type: 'comparison' as const,
    field,
    op: op as ComparisonOp,
    value: val,
  }
})


/** A factor: parenthesised expression or a comparison. */
const factor: Parser<FilterNode> = recursiveParser(() =>
  choice([parenthetical, comparison])
)

/**
 * Full expression: factors joined by AND/OR, left-associative.
 * Uses sequenceOf + many for the tail rather than a coroutine loop.
 */
const expression: Parser<FilterNode> = recursiveParser(() =>
  sequenceOf([
    factor,
    many(
      sequenceOf([
        whitespace,
        logicalOp,
        whitespace,
        factor,
      ])
    ),
  ]).map(([first, rest]): FilterNode => {
    let left: FilterNode = first as FilterNode
    for (const [, op, , right] of rest) {
      left = {
        type: 'logical' as const,
        operator: op as 'AND' | 'OR',
        left,
        right: right as FilterNode,
      }
    }
    return left
  })
)

const parenthetical = coroutine<FilterNode>(run => {
  run(char('('))
  run(optionalWhitespace)
  const r = run(expression)
  run(optionalWhitespace)
  run(char(')'))
  return r
})


// ============================================================================
// Public API
// ============================================================================

/**
 * Parse a filter expression string into a FilterNode AST.
 *
 * @throws ErrQueryParse on malformed input
 */
export function parseFilter(input: string): FilterNode {
  const trimmed = input.trim()
  if (!trimmed) {
    throw ErrQueryParse.create({
      expression: input,
      reason: 'Empty filter expression',
      index: 0,
    })
  }

  const result = expression.run(trimmed)

  if (result.isError) {
    throw ErrQueryParse.create({
      expression: input,
      reason: result.error,
      index: result.index,
    })
  }

  if (result.index < trimmed.length) {
    throw ErrQueryParse.create({
      expression: input,
      reason: `Unexpected input at position ${result.index}: "${trimmed.slice(result.index)}"`,
      index: result.index,
    })
  }

  return result.result
}
