/**
 * Scope - The level at which Maxwell operates.
 *
 * Scopes form a hierarchy:
 *   Installation < Workspace < Global
 *
 * Installation: Single engine, single installation. No installation context needed.
 * Workspace: Multiple installations. Refs carry installationId.
 * Global: Multiple workspaces. Refs carry workspace and installationId
 */

import { StaticTypeCompanion } from './companion.js'
import {InstallationId, WorkspaceId} from "./core-id-types.js";

export interface InstallationScope {
  readonly kind: 'installation'
}

export interface WorkspaceScope {
  readonly kind: 'workspace'
  readonly installationId: InstallationId
}

export interface GlobalScope {
  readonly kind: 'global'
  readonly workspaceId: WorkspaceId
  readonly installationId: InstallationId
}

export type Scope = InstallationScope | WorkspaceScope | GlobalScope;

export type ScopedResource<T, TScope extends Scope> = {
  scope: TScope
  value: T
}

export const Scope = StaticTypeCompanion({
  installation(): InstallationScope {
    return { kind: 'installation' }
  },

  workspace(installationId: InstallationId): WorkspaceScope {
    return { kind: 'workspace', installationId }
  },

  isInstallation(scope: Scope): scope is InstallationScope {
    return scope.kind === 'installation'
  },

  isWorkspace(scope: Scope): scope is WorkspaceScope {
    return scope.kind === 'workspace'
  },

  global(workspaceId: WorkspaceId, installationId: InstallationId): GlobalScope {
    return { kind: 'global', workspaceId, installationId }
  },

  isGlobal(scope: Scope): scope is GlobalScope {
    return scope.kind === 'global'
  },

  wrap<T, S extends Scope>(scope: S, value: T): ScopedResource<T, S> {
    return { scope, value }
  },
})
