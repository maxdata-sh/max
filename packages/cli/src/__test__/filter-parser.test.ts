import { describe, test, expect } from 'bun:test'
import { parseFilter } from '../parsers/filter-parser.js'

const FIELDS = ['name', 'active', 'priority', 'status', 'email', 'count']

describe('parseFilter', () => {
  // ---------------------------------------------------------------
  // Basic parsing
  // ---------------------------------------------------------------

  test('single equality', () => {
    const result = parseFilter('name=Acme', FIELDS)
    expect(result).toEqual([{ field: 'name', op: '=', value: 'Acme' }])
  })

  test('spaced equality', () => {
    const result = parseFilter('name = Acme', FIELDS)
    expect(result).toEqual([{ field: 'name', op: '=', value: 'Acme' }])
  })

  test('AND conjunction', () => {
    const result = parseFilter('name=Acme AND status=open', FIELDS)
    expect(result).toEqual([
      { field: 'name', op: '=', value: 'Acme' },
      { field: 'status', op: '=', value: 'open' },
    ])
  })

  test('lowercase and works', () => {
    const result = parseFilter('name=Acme and status=open', FIELDS)
    expect(result).toEqual([
      { field: 'name', op: '=', value: 'Acme' },
      { field: 'status', op: '=', value: 'open' },
    ])
  })

  // ---------------------------------------------------------------
  // Operators
  // ---------------------------------------------------------------

  test('!= operator', () => {
    const result = parseFilter('status!=closed', FIELDS)
    expect(result).toEqual([{ field: 'status', op: '!=', value: 'closed' }])
  })

  test('>= operator', () => {
    const result = parseFilter('priority>=2', FIELDS)
    expect(result).toEqual([{ field: 'priority', op: '>=', value: 2 }])
  })

  test('<= operator', () => {
    const result = parseFilter('count<=100', FIELDS)
    expect(result).toEqual([{ field: 'count', op: '<=', value: 100 }])
  })

  test('> operator', () => {
    const result = parseFilter('priority>3', FIELDS)
    expect(result).toEqual([{ field: 'priority', op: '>', value: 3 }])
  })

  test('< operator', () => {
    const result = parseFilter('priority<5', FIELDS)
    expect(result).toEqual([{ field: 'priority', op: '<', value: 5 }])
  })

  test('~= maps to contains', () => {
    const result = parseFilter('name~=Acme', FIELDS)
    expect(result).toEqual([{ field: 'name', op: 'contains', value: 'Acme' }])
  })

  // ---------------------------------------------------------------
  // Value coercion — booleans
  // ---------------------------------------------------------------

  test('true is parsed as boolean true', () => {
    const result = parseFilter('active=true', FIELDS)
    expect(result).toEqual([{ field: 'active', op: '=', value: true }])
  })

  test('false is parsed as boolean false', () => {
    const result = parseFilter('active=false', FIELDS)
    expect(result).toEqual([{ field: 'active', op: '=', value: false }])
  })

  test('TRUE (uppercase) is parsed as boolean', () => {
    const result = parseFilter('active=TRUE', FIELDS)
    expect(result).toEqual([{ field: 'active', op: '=', value: true }])
  })

  test('FALSE (uppercase) is parsed as boolean', () => {
    const result = parseFilter('active=FALSE', FIELDS)
    expect(result).toEqual([{ field: 'active', op: '=', value: false }])
  })

  // ---------------------------------------------------------------
  // Value coercion — numbers
  // ---------------------------------------------------------------

  test('integer value is parsed as number', () => {
    const result = parseFilter('priority=3', FIELDS)
    expect(result).toEqual([{ field: 'priority', op: '=', value: 3 }])
  })

  test('negative number is parsed as number', () => {
    const result = parseFilter('priority=-1', FIELDS)
    expect(result).toEqual([{ field: 'priority', op: '=', value: -1 }])
  })

  test('decimal value is parsed as number', () => {
    const result = parseFilter('priority=3.5', FIELDS)
    expect(result).toEqual([{ field: 'priority', op: '=', value: 3.5 }])
  })

  test('zero is parsed as number', () => {
    const result = parseFilter('count=0', FIELDS)
    expect(result).toEqual([{ field: 'count', op: '=', value: 0 }])
  })

  // ---------------------------------------------------------------
  // String values stay as strings
  // ---------------------------------------------------------------

  test('non-numeric string stays as string', () => {
    const result = parseFilter('name=hello', FIELDS)
    expect(result).toEqual([{ field: 'name', op: '=', value: 'hello' }])
  })

  test('quoted value stays as string even if numeric', () => {
    const result = parseFilter('name="42"', FIELDS)
    expect(result).toEqual([{ field: 'name', op: '=', value: '42' }])
  })

  test('quoted true stays as string', () => {
    const result = parseFilter('name="true"', FIELDS)
    expect(result).toEqual([{ field: 'name', op: '=', value: 'true' }])
  })

  // ---------------------------------------------------------------
  // Quoted values
  // ---------------------------------------------------------------

  test('double-quoted value with spaces', () => {
    const result = parseFilter('name="John Doe"', FIELDS)
    expect(result).toEqual([{ field: 'name', op: '=', value: 'John Doe' }])
  })

  test('single-quoted value', () => {
    const result = parseFilter("name='hello world'", FIELDS)
    expect(result).toEqual([{ field: 'name', op: '=', value: 'hello world' }])
  })

  // ---------------------------------------------------------------
  // Compound expressions
  // ---------------------------------------------------------------

  test('three filters ANDed', () => {
    const result = parseFilter('name=Acme AND active=true AND priority>=2', FIELDS)
    expect(result).toEqual([
      { field: 'name', op: '=', value: 'Acme' },
      { field: 'active', op: '=', value: true },
      { field: 'priority', op: '>=', value: 2 },
    ])
  })

  // ---------------------------------------------------------------
  // Empty input
  // ---------------------------------------------------------------

  test('empty string returns empty array', () => {
    expect(parseFilter('', FIELDS)).toEqual([])
  })

  test('whitespace-only returns empty array', () => {
    expect(parseFilter('   ', FIELDS)).toEqual([])
  })

  // ---------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------

  test('unknown field throws', () => {
    expect(() => parseFilter('unknown=foo', FIELDS)).toThrow()
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

  test('OR is not supported (treated as unknown token)', () => {
    expect(() => parseFilter('name=Acme OR status=open', FIELDS)).toThrow()
  })
})
