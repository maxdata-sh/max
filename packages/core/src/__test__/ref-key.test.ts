import { describe, test, expect } from "bun:test";
import { RefKey } from "../ref-key.js";
import {Scope} from "../scope.js";
import { EntityId, EntityType, InstallationId, WorkspaceId } from '../core-id-types.js'

describe('RefKey', () => {
  describe('installation', () => {
    test('round-trips through create and parse', () => {
      const key = RefKey.installation('User', 'u1')
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.installation())
      expect(parsed.entityType).toBe('User')
      expect(parsed.entityId).toBe('u1')
    })

    test('handles entityId containing colons', () => {
      const key = RefKey.installation('User', 'user:123')
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.installation())
      expect(parsed.entityType).toBe('User')
      expect(parsed.entityId).toBe('user:123')
    })

    test('handles entityId with many colons', () => {
      const id = 'a:b:c:d:e:f'
      const key = RefKey.installation('Thing', id)
      const parsed = RefKey.parse(key)

      expect(parsed.entityType).toBe('Thing')
      expect(parsed.entityId).toBe('a:b:c:d:e:f')
    })
  })

  describe('system', () => {
    test('round-trips through create and parse', () => {
      const key = RefKey.workspace('inst-1' as InstallationId, 'Team', 't1')
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.workspace('inst-1'))
      expect(parsed.entityType).toBe('Team')
      expect(parsed.entityId).toBe('t1')
    })

    test('handles entityId containing colons', () => {
      const key = RefKey.workspace('inst-1' as InstallationId, 'Team', 'team:42')
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.workspace('inst-1'))
      expect(parsed.entityType).toBe('Team')
      expect(parsed.entityId).toBe('team:42')
    })

    test('handles entityId with many colons', () => {
      const id = 'x:y:z:w'
      const key = RefKey.workspace('inst-2' as InstallationId, 'Widget', id)
      const parsed = RefKey.parse(key)

      expect(parsed.entityType).toBe('Widget')
      expect(parsed.entityId).toBe('x:y:z:w')
    })
  })

  describe('global', () => {
    test('round-trips through create and parse', () => {
      const key = RefKey.global('ws-1', 'inst-1', 'User', 'u1')
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.global('ws-1', 'inst-1'))
      expect(parsed.entityType).toBe('User')
      expect(parsed.entityId).toBe('u1')
    })

    test('handles entityId containing colons', () => {
      const key = RefKey.global('ws-1', 'inst-1', 'User', 'user:123')
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.global('ws-1', 'inst-1'))
      expect(parsed.entityType).toBe('User')
      expect(parsed.entityId).toBe('user:123')
    })

    test('produces egl prefix', () => {
      const key = RefKey.global('ws-1', 'inst-1', 'User', 'u1')
      expect((key as string).startsWith('egl:')).toBe(true)
    })
  })

  describe('from() with scope', () => {
    test('creates installation key when scope is installation', () => {
      const key = RefKey.from('User', 'u:1', Scope.installation())
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.installation())
      expect(parsed.entityId).toBe('u:1')
    })

    test('creates system key when scope is system', () => {
      const key = RefKey.from('User', 'u:1', Scope.workspace('inst-1'))
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.workspace('inst-1'))
      expect(parsed.entityId).toBe('u:1')
    })

    test('creates global key when scope is global', () => {
      const key = RefKey.from('Team', 't:1', Scope.global('ws-1', 'inst-1'))
      const parsed = RefKey.parse(key)

      expect(parsed.scope).toEqual(Scope.global('ws-1', 'inst-1'))
      expect(parsed.entityType).toBe('Team')
      expect(parsed.entityId).toBe('t:1')
    })
  })

  describe('invalid inputs', () => {
    test('throws on empty string', () => {
      expect(() => RefKey.parse('' as RefKey)).toThrow('Invalid RefKey format')
    })

    test('throws on no delimiters', () => {
      expect(() => RefKey.parse('garbage' as RefKey)).toThrow('Invalid RefKey format')
    })

    test('throws on single delimiter', () => {
      expect(() => RefKey.parse('installation:' as RefKey)).toThrow('Invalid RefKey format')
    })

    test('throws on unknown scope', () => {
      expect(() => RefKey.parse('other:Type:id' as RefKey)).toThrow('Invalid RefKey format')
    })

    test('throws on system key with only two segments after scope', () => {
      expect(() => RefKey.parse('system:inst:type' as RefKey)).toThrow('Invalid RefKey format')
    })
  })

  describe('tryParse', () => {
    test('returns parsed result for valid key', () => {
      const key = RefKey.installation('User', 'u1')
      expect(RefKey.tryParse(key as string)).toEqual({
        scope: Scope.installation(),
        entityType: 'User',
        entityId: 'u1',
      })
    })

    test('returns undefined for invalid string', () => {
      expect(RefKey.tryParse('nope')).toBeUndefined()
    })
  })

  describe('isValid', () => {
    test('returns true for valid installation key', () => {
      expect(RefKey.isValid('ein:User:u1')).toBe(true)
    })

    test('returns true for valid workspace key', () => {
      expect(RefKey.isValid('ews:inst:User:u1')).toBe(true)
    })

    test('returns true for valid global key', () => {
      expect(RefKey.isValid('egl:ws:inst:User:u1')).toBe(true)
    })

    test('returns false for garbage', () => {
      expect(RefKey.isValid('not-a-key')).toBe(false)
    })
  })
})
