import { describe, test, expect } from "bun:test"
import { Scope } from "../scope.js"

describe('Scope', () => {
  describe('global', () => {
    test('Scope.global() returns correct shape', () => {
      const scope = Scope.global('ws-1', 'inst-1')
      expect(scope).toEqual({ kind: 'global', workspaceId: 'ws-1', installationId: 'inst-1' })
    })

    test('Scope.isGlobal() type guard', () => {
      const global = Scope.global('ws-1', 'inst-1')
      const workspace = Scope.workspace('inst-1')
      const installation = Scope.installation()

      expect(Scope.isGlobal(global)).toBe(true)
      expect(Scope.isGlobal(workspace)).toBe(false)
      expect(Scope.isGlobal(installation)).toBe(false)
    })
  })

  describe('existing scopes unchanged', () => {
    test('installation', () => {
      const scope = Scope.installation()
      expect(scope).toEqual({ kind: 'installation' })
      expect(Scope.isInstallation(scope)).toBe(true)
    })

    test('workspace', () => {
      const scope = Scope.workspace('inst-1')
      expect(scope).toEqual({ kind: 'workspace', installationId: 'inst-1' })
      expect(Scope.isWorkspace(scope)).toBe(true)
    })
  })
})
