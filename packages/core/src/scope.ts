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

import type { InstallationId } from './ref-key.js'
import { StaticTypeCompanion } from './companion.js'

export interface InstallationScope {
  readonly kind: 'installation'
}

export interface WorkspaceScope {
  readonly kind: 'workspace'
  readonly installationId: InstallationId
}

export type Scope = InstallationScope | WorkspaceScope;

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
    return scope.kind === "workspace";
  },
})
