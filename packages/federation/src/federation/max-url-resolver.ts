/**
 * MaxUrlResolver — Hop-by-hop URL resolution for the federation hierarchy.
 *
 * A local-only capability produced by concrete Max classes (GlobalMax, etc.).
 * Entry points obtain a resolver via `globalMax.maxUrlResolver()`.
 *
 * Resolution walks the URL segments using registries and supervisors owned
 * by the level that produces the resolver. Physical locators are never seen
 * by the resolver — it only works with identity (names and IDs).
 */

import { MaxUrl, type InstallationId, type WorkspaceId } from '@max/core'
import type { GlobalClient } from '../protocols/global-client.js'
import type { WorkspaceClient } from '../protocols/workspace-client.js'
import type { InstallationClient } from '../protocols/installation-client.js'
import {
  ErrRemoteUrlNotSupported,
  ErrWorkspaceNotResolved,
  ErrInstallationNotResolved,
} from '../errors/errors.js'

// ============================================================================
// ResolvedTarget
// ============================================================================

export type ResolvedTarget =
  | { level: 'global'; global: GlobalClient }
  | { level: 'workspace'; global: GlobalClient; workspace: WorkspaceClient; id: WorkspaceId }
  | { level: 'installation'; global: GlobalClient; workspace: WorkspaceClient; installation: InstallationClient; id: InstallationId; workspaceId: WorkspaceId }

// ============================================================================
// MaxUrlResolver Interface
// ============================================================================

export interface MaxUrlResolver {
  resolve(url: MaxUrl): ResolvedTarget
}

// ============================================================================
// Type guard for workspace clients that support name-or-ID lookup
// ============================================================================

type WorkspaceWithNameLookup = WorkspaceClient & {
  installationByNameOrId(nameOrId: string): { id: InstallationId; client: InstallationClient } | undefined
}

export function hasInstallationNameLookup(client: WorkspaceClient): client is WorkspaceWithNameLookup {
  return 'installationByNameOrId' in client
}
