import { describe, test, expect } from "bun:test"
import { MaxUrl } from "../max-url.js"
import { Scope } from "../scope.js"

describe('MaxUrl', () => {
  describe('parse', () => {
    test('max://~ → global, host ~', () => {
      const url = MaxUrl.parse('max://~')
      expect(url.host).toBe('~')
      expect(url.workspace).toBeUndefined()
      expect(url.installation).toBeUndefined()
      expect(url.level).toBe('global')
    })

    test('max://~/my-project → workspace level', () => {
      const url = MaxUrl.parse('max://~/my-project')
      expect(url.host).toBe('~')
      expect(url.workspace).toBe('my-project')
      expect(url.installation).toBeUndefined()
      expect(url.level).toBe('workspace')
    })

    test('max://~/my-project/linear → installation level', () => {
      const url = MaxUrl.parse('max://~/my-project/linear')
      expect(url.host).toBe('~')
      expect(url.workspace).toBe('my-project')
      expect(url.installation).toBe('linear')
      expect(url.level).toBe('installation')
    })

    test('max://example.com/ws/inst → remote host', () => {
      const url = MaxUrl.parse('max://example.com/ws/inst')
      expect(url.host).toBe('example.com')
      expect(url.workspace).toBe('ws')
      expect(url.installation).toBe('inst')
      expect(url.isLocal).toBe(false)
    })

    test('rejects missing prefix', () => {
      expect(() => MaxUrl.parse('http://~')).toThrow('Must start with max://')
    })

    test('rejects empty path', () => {
      expect(() => MaxUrl.parse('max://')).toThrow('Host segment required')
    })

    test('rejects >3 segments', () => {
      expect(() => MaxUrl.parse('max://~/a/b/c')).toThrow('Max 3 segments')
    })
  })

  describe('isLocal', () => {
    test('~ is local', () => {
      expect(MaxUrl.parse('max://~').isLocal).toBe(true)
    })

    test('hostname is not local', () => {
      expect(MaxUrl.parse('max://staging.max.internal/prod').isLocal).toBe(false)
    })
  })

  describe('round-trip', () => {
    test('parse(url.toString()) preserves all fields', () => {
      const urls = [
        'max://~',
        'max://~/my-team',
        'max://~/my-team/hubspot-prod',
        'max://example.com/ws/inst',
      ]
      for (const str of urls) {
        const roundTripped = MaxUrl.parse(MaxUrl.parse(str).toString())
        const original = MaxUrl.parse(str)
        expect(roundTripped.host).toBe(original.host)
        expect(roundTripped.workspace).toBe(original.workspace)
        expect(roundTripped.installation).toBe(original.installation)
        expect(roundTripped.level).toBe(original.level)
      }
    })
  })

  describe('navigation', () => {
    test('parent() from installation → workspace', () => {
      const url = MaxUrl.parse('max://~/team/inst')
      const parent = url.parent()!
      expect(parent.level).toBe('workspace')
      expect(parent.workspace).toBe('team')
      expect(parent.installation).toBeUndefined()
    })

    test('parent() from workspace → global', () => {
      const url = MaxUrl.parse('max://~/team')
      const parent = url.parent()!
      expect(parent.level).toBe('global')
      expect(parent.host).toBe('~')
      expect(parent.workspace).toBeUndefined()
    })

    test('parent() from global → undefined', () => {
      const url = MaxUrl.parse('max://~')
      expect(url.parent()).toBeUndefined()
    })

    test('child() from global → workspace', () => {
      const url = MaxUrl.global()
      const child = url.child('my-team')
      expect(child.level).toBe('workspace')
      expect(child.workspace).toBe('my-team')
    })

    test('child() from workspace → installation', () => {
      const url = MaxUrl.forWorkspace('my-team')
      const child = url.child('hubspot')
      expect(child.level).toBe('installation')
      expect(child.installation).toBe('hubspot')
    })

    test('child() from installation → throws', () => {
      const url = MaxUrl.forInstallation('team', 'inst')
      expect(() => url.child('x')).toThrow('Cannot add child below installation')
    })
  })

  describe('static factories', () => {
    test('global() defaults to ~', () => {
      const url = MaxUrl.global()
      expect(url.toString()).toBe('max://~')
    })

    test('forWorkspace()', () => {
      const url = MaxUrl.forWorkspace('my-team')
      expect(url.toString()).toBe('max://~/my-team')
    })

    test('forInstallation()', () => {
      const url = MaxUrl.forInstallation('my-team', 'hubspot')
      expect(url.toString()).toBe('max://~/my-team/hubspot')
    })
  })

  describe('ScopeUpgradeable', () => {
    test('upgradeScope preserves URL segments, changes only scope', () => {
      const url = MaxUrl.parse('max://~/team/inst')
      const wsScope = Scope.workspace('inst-1')
      const upgraded = url.upgradeScope(wsScope)

      expect(upgraded.host).toBe('~')
      expect(upgraded.workspace).toBe('team')
      expect(upgraded.installation).toBe('inst')
      expect(upgraded.scope).toEqual(wsScope)
    })
  })
})
