/**
 * ResolvedContext — The resolved execution level, URL, and clients.
 *
 * Parent clients are always available: at installation level you get
 * global + workspace + installation. At workspace level, global + workspace.
 * This mirrors the resolver's walk — by the time it finds an installation,
 * it has already resolved the workspace and global.
 *
 * Use `ContextAt<L>` when you know the level statically (e.g. in a
 * command class). This gives type-safe access to level-specific clients
 * without assertions.
 */

import type { MaxUrlLevel } from '@max/core'
import { MaxUrl } from '@max/core'
import type { GlobalClient, WorkspaceClient, InstallationClient, ResolvedTarget } from '@max/federation'

type CLIInstallationContext = {
  readonly level: 'installation'
  readonly url: MaxUrl
  readonly global: GlobalClient
  readonly workspace: WorkspaceClient
  readonly installation: InstallationClient
}
type CLIWorkspaceContext = {
  readonly level: 'workspace';
  readonly url: MaxUrl;
  readonly global: GlobalClient;
  readonly workspace: WorkspaceClient
}
type CLIGlobalContext = {
  readonly level: 'global'
  readonly url: MaxUrl
  readonly global: GlobalClient
}

export type CLIAnyContext = CLIInstallationContext | CLIWorkspaceContext | CLIGlobalContext

/** Level-specific context — narrows available clients by level. */
export type ContextAt<L extends MaxUrlLevel> = Extract<CLIAnyContext, { level: L }>

/** Flat union of all context shapes — use when level is unknown. */
export type ResolvedContext = ContextAt<MaxUrlLevel>

/** Lift a federation ResolvedTarget into a CLI ResolvedContext. */
export function toContext(target: ResolvedTarget, url: MaxUrl): ResolvedContext {
  switch (target.level) {
    case 'global':
      return { level: 'global', url, global: target.global }
    case 'workspace':
      return { level: 'workspace', url, global: target.global, workspace: target.workspace }
    case 'installation':
      return { level: 'installation', url, global: target.global, workspace: target.workspace, installation: target.installation }
  }
}
