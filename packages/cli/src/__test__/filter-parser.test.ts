import { describe, test, expect } from 'bun:test'
import { WhereClause } from '@max/core'
import type { QueryFilter } from '@max/core'
import { parseFilter } from '../parsers/filter-parser.js'

const FIELDS = ['name', 'active', 'priority', 'status', 'email', 'count']

/** Shorthand for a leaf QueryFilter. */
const leaf = (field: string, op: QueryFilter['op'], value: unknown): QueryFilter => ({ field, op, value })

describe('parseFilter', () => {
  // ---------------------------------------------------------------
  // Basic parsing — single comparisons return a leaf QueryFilter
  // ---------------------------------------------------------------

  test('single equality', () => {
    const result = parseFilter('name=Acme', FIELDS)
    expect(result).toEqual(leaf('name', '=', 'Acme'))
  })

  test('spaced equality', () => {
    const result = parseFilter('name = Acme', FIELDS)
    expect(result).toEqual(leaf('name', '=', 'Acme'))
  })

  test('AND conjunction', () => {
    const result = parseFilter('name=Acme AND status=open', FIELDS)
    expect(result).toEqual(WhereClause.and(
      leaf('name', '=', 'Acme'),
      leaf('status', '=', 'open'),
    ))
  })

  test('lowercase and works', () => {
    const result = parseFilter('name=Acme and status=open', FIELDS)
    expect(result).toEqual(WhereClause.and(
      leaf('name', '=', 'Acme'),
      leaf('status', '=', 'open'),
    ))
  })

  // ---------------------------------------------------------------
  // OR support
  // ---------------------------------------------------------------

  test('OR conjunction', () => {
    const result = parseFilter('name=Acme OR name=Beta', FIELDS)
    expect(result).toEqual(WhereClause.or(
      leaf('name', '=', 'Acme'),
      leaf('name', '=', 'Beta'),
    ))
  })

  test('grouped OR with AND', () => {
    const result = parseFilter('(name=Acme OR name=Beta) AND active=true', FIELDS)
    expect(result).toEqual(WhereClause.and(
      WhereClause.or(
        leaf('name', '=', 'Acme'),
        leaf('name', '=', 'Beta'),
      ),
      leaf('active', '=', true),
    ))
  })

  // ---------------------------------------------------------------
  // Operators
  // ---------------------------------------------------------------

  test('!= operator', () => {
    expect(parseFilter('status!=closed', FIELDS)).toEqual(leaf('status', '!=', 'closed'))
  })

  test('>= operator', () => {
    expect(parseFilter('priority>=2', FIELDS)).toEqual(leaf('priority', '>=', 2))
  })

  test('<= operator', () => {
    expect(parseFilter('count<=100', FIELDS)).toEqual(leaf('count', '<=', 100))
  })

  test('> operator', () => {
    expect(parseFilter('priority>3', FIELDS)).toEqual(leaf('priority', '>', 3))
  })

  test('< operator', () => {
    expect(parseFilter('priority<5', FIELDS)).toEqual(leaf('priority', '<', 5))
  })

  test('~= maps to contains', () => {
    expect(parseFilter('name~=Acme', FIELDS)).toEqual(leaf('name', 'contains', 'Acme'))
  })

  // ---------------------------------------------------------------
  // Value coercion — booleans
  // ---------------------------------------------------------------

  test('true is parsed as boolean true', () => {
    expect(parseFilter('active=true', FIELDS)).toEqual(leaf('active', '=', true))
  })

  test('false is parsed as boolean false', () => {
    expect(parseFilter('active=false', FIELDS)).toEqual(leaf('active', '=', false))
  })

  test('TRUE (uppercase) is parsed as boolean', () => {
    expect(parseFilter('active=TRUE', FIELDS)).toEqual(leaf('active', '=', true))
  })

  test('FALSE (uppercase) is parsed as boolean', () => {
    expect(parseFilter('active=FALSE', FIELDS)).toEqual(leaf('active', '=', false))
  })

  // ---------------------------------------------------------------
  // Value coercion — numbers
  // ---------------------------------------------------------------

  test('integer value is parsed as number', () => {
    expect(parseFilter('priority=3', FIELDS)).toEqual(leaf('priority', '=', 3))
  })

  test('negative number is parsed as number', () => {
    expect(parseFilter('priority=-1', FIELDS)).toEqual(leaf('priority', '=', -1))
  })

  test('decimal value is parsed as number', () => {
    expect(parseFilter('priority=3.5', FIELDS)).toEqual(leaf('priority', '=', 3.5))
  })

  test('zero is parsed as number', () => {
    expect(parseFilter('count=0', FIELDS)).toEqual(leaf('count', '=', 0))
  })

  // ---------------------------------------------------------------
  // String values stay as strings
  // ---------------------------------------------------------------

  test('non-numeric string stays as string', () => {
    expect(parseFilter('name=hello', FIELDS)).toEqual(leaf('name', '=', 'hello'))
  })

  test('quoted value stays as string even if numeric', () => {
    expect(parseFilter('name="42"', FIELDS)).toEqual(leaf('name', '=', '42'))
  })

  test('quoted true stays as string', () => {
    expect(parseFilter('name="true"', FIELDS)).toEqual(leaf('name', '=', 'true'))
  })

  // ---------------------------------------------------------------
  // Quoted values
  // ---------------------------------------------------------------

  test('double-quoted value with spaces', () => {
    expect(parseFilter('name="John Doe"', FIELDS)).toEqual(leaf('name', '=', 'John Doe'))
  })

  test('single-quoted value', () => {
    expect(parseFilter("name='hello world'", FIELDS)).toEqual(leaf('name', '=', 'hello world'))
  })

  // ---------------------------------------------------------------
  // Compound expressions
  // ---------------------------------------------------------------

  test('three filters ANDed', () => {
    const result = parseFilter('name=Acme AND active=true AND priority>=2', FIELDS)
    // Left-associative: (name AND active) AND priority
    expect(result).toEqual(WhereClause.and(
      WhereClause.and(
        leaf('name', '=', 'Acme'),
        leaf('active', '=', true),
      ),
      leaf('priority', '>=', 2),
    ))
  })

  // ---------------------------------------------------------------
  // Empty input
  // ---------------------------------------------------------------

  test('empty string returns empty WhereClause', () => {
    expect(parseFilter('', FIELDS)).toEqual(WhereClause.empty)
  })

  test('whitespace-only returns empty WhereClause', () => {
    expect(parseFilter('   ', FIELDS)).toEqual(WhereClause.empty)
  })

  // ---------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------

  test('unknown field throws', () => {
    expect(() => parseFilter('unknown=foo', FIELDS)).toThrow()
  })

  test('unknown field in OR throws', () => {
    expect(() => parseFilter('name=Acme OR unknown=foo', FIELDS)).toThrow()
  })

  test('missing value throws', () => {
    expect(() => parseFilter('name=', FIELDS)).toThrow()
  })

  test('missing operator throws', () => {
    expect(() => parseFilter('name Acme', FIELDS)).toThrow()
  })

  test('trailing AND throws', () => {
    expect(() => parseFilter('name=Acme AND', FIELDS)).toThrow()
  })
})
