/**
 * MaxUrlResolver — Hop-by-hop URL resolution for the federation hierarchy.
 *
 * A local-only capability produced by concrete Max classes (GlobalMax, etc.).
 * Entry points obtain a resolver via `globalMax.maxUrlResolver`.
 *
 * Resolution walks the URL segments using registries and supervisors owned
 * by the level that produces the resolver. Physical locators are never seen
 * by the resolver — it only works with identity (names and IDs).
 */

import { MaxUrl } from '@max/core'
import type { GlobalClient } from '../protocols/global-client.js'
import {
  InstallationClientWithIdentity,
  WorkspaceClientWithIdentity,
} from '../protocols/with-client-identity.js'

// ============================================================================
// ResolvedTarget
// ============================================================================

export type ResolvedTarget =
  | { level: 'global'; global: GlobalClient }
  | { level: 'workspace'; global: GlobalClient; workspace: WorkspaceClientWithIdentity }
  | { level: 'installation'; global: GlobalClient; workspace: WorkspaceClientWithIdentity; installation: InstallationClientWithIdentity; }

// ============================================================================
// MaxUrlResolver Interface
// ============================================================================

export interface MaxUrlResolver {
  resolve(url: MaxUrl): Promise<ResolvedTarget>
}
