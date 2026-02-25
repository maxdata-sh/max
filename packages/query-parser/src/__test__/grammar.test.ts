import { describe, test, expect } from 'bun:test'
import { parseFilter } from '../grammar.js'
import { lowerToFilters } from '../lower.js'
import { coerceValue } from '../coerce.js'
import type { ValueLiteral } from '../ast.js'

// Quick smoke test to validate arcsecond grammar works
describe('parseFilter (grammar)', () => {
  test('simple equality', () => {
    const ast = parseFilter('name = Acme')
    expect(ast).toEqual({
      type: 'comparison',
      field: 'name',
      op: '=',
      value: { raw: 'Acme', quoted: false },
    })
  })

  test('no-space equality', () => {
    const ast = parseFilter('name=Acme')
    expect(ast).toEqual({
      type: 'comparison',
      field: 'name',
      op: '=',
      value: { raw: 'Acme', quoted: false },
    })
  })

  test('quoted value', () => {
    const ast = parseFilter('name = "John Doe"')
    expect(ast).toEqual({
      type: 'comparison',
      field: 'name',
      op: '=',
      value: { raw: 'John Doe', quoted: true },
    })
  })

  test('AND conjunction', () => {
    const ast = parseFilter('name = Acme AND active = true')
    expect(ast).toEqual({
      type: 'logical',
      operator: 'AND',
      left: {
        type: 'comparison',
        field: 'name',
        op: '=',
        value: { raw: 'Acme', quoted: false },
      },
      right: {
        type: 'comparison',
        field: 'active',
        op: '=',
        value: { raw: 'true', quoted: false },
      },
    })
  })

  test('OR conjunction', () => {
    const ast = parseFilter('name = Acme OR name = Beta')
    expect(ast.type).toBe('logical')
    if (ast.type === 'logical') {
      expect(ast.operator).toBe('OR')
    }
  })

  test('all operators', () => {
    for (const op of ['=', '!=', '>', '>=', '<', '<=', '~=']) {
      const ast = parseFilter(`priority ${op} 5`)
      expect(ast.type).toBe('comparison')
      if (ast.type === 'comparison') {
        expect(ast.op).toBe(op)
      }
    }
  })

  test('grouped expression', () => {
    const ast = parseFilter('(name = Acme OR name = Beta) AND active = true')
    expect(ast.type).toBe('logical')
    if (ast.type === 'logical') {
      expect(ast.operator).toBe('AND')
      expect(ast.left.type).toBe('logical')
      if (ast.left.type === 'logical') {
        expect(ast.left.operator).toBe('OR')
      }
    }
  })

  test('empty input throws', () => {
    expect(() => parseFilter('')).toThrow()
    expect(() => parseFilter('   ')).toThrow()
  })
})

describe('lowerToFilters', () => {
  test('single comparison', () => {
    const ast = parseFilter('name = Acme')
    const filters = lowerToFilters(ast)
    expect(filters).toEqual([{ field: 'name', op: '=', value: 'Acme' }])
  })

  test('AND flattens to array', () => {
    const ast = parseFilter('name = Acme AND active = true')
    const filters = lowerToFilters(ast)
    expect(filters).toEqual([
      { field: 'name', op: '=', value: 'Acme' },
      { field: 'active', op: '=', value: true },
    ])
  })

  test('~= maps to contains', () => {
    const ast = parseFilter('name ~= Acme')
    const filters = lowerToFilters(ast)
    expect(filters).toEqual([{ field: 'name', op: 'contains', value: 'Acme' }])
  })

  test('OR throws', () => {
    const ast = parseFilter('name = Acme OR name = Beta')
    expect(() => lowerToFilters(ast, 'name = Acme OR name = Beta')).toThrow()
  })

  test('boolean coercion', () => {
    const ast = parseFilter('active = true')
    const filters = lowerToFilters(ast)
    expect(filters[0].value).toBe(true)
  })

  test('number coercion', () => {
    const ast = parseFilter('priority >= 5')
    const filters = lowerToFilters(ast)
    expect(filters[0].value).toBe(5)
  })

  test('quoted value stays string', () => {
    const ast = parseFilter('name = "42"')
    const filters = lowerToFilters(ast)
    expect(filters[0].value).toBe('42')
  })
})

describe('coerceValue', () => {
  const unquoted = (raw: string): ValueLiteral => ({ raw, quoted: false })
  const quoted = (raw: string): ValueLiteral => ({ raw, quoted: true })

  test('true → boolean', () => expect(coerceValue(unquoted('true'))).toBe(true))
  test('false → boolean', () => expect(coerceValue(unquoted('false'))).toBe(false))
  test('TRUE → boolean', () => expect(coerceValue(unquoted('TRUE'))).toBe(true))
  test('integer → number', () => expect(coerceValue(unquoted('42'))).toBe(42))
  test('negative → number', () => expect(coerceValue(unquoted('-1'))).toBe(-1))
  test('decimal → number', () => expect(coerceValue(unquoted('3.5'))).toBe(3.5))
  test('zero → number', () => expect(coerceValue(unquoted('0'))).toBe(0))
  test('string stays string', () => expect(coerceValue(unquoted('hello'))).toBe('hello'))
  test('quoted "true" stays string', () => expect(coerceValue(quoted('true'))).toBe('true'))
  test('quoted "42" stays string', () => expect(coerceValue(quoted('42'))).toBe('42'))
})
