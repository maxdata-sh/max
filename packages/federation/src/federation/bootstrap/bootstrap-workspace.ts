/**
 * bootstrapWorkspace — Pure wiring function.
 *
 * Takes fully resolved, concrete dependencies and assembles a working
 * WorkspaceMax. No filesystem access, no platform imports, no config
 * resolution. Just assembly.
 *
 * Resolution (spec → concrete deps) is the provider's job.
 * Wiring (concrete deps → working WorkspaceMax) is bootstrap's job.
 */

import type { ConnectorRegistry } from '@max/connector'
import { WorkspaceMax } from '../workspace-max.js'
import { InstallationSupervisor } from '../supervisors.js'
import { InstallationRegistry } from '../installation-registry.js'
import { Platform } from '../../platform/index.js'

// ============================================================================
// ResolvedWorkspaceDeps
// ============================================================================

/**
 * Everything needed to wire a working WorkspaceMax.
 * All dependencies are concrete, resolved implementations — no abstract config.
 */
export interface ResolvedWorkspaceDeps {
  platform: Platform
  installationSupervisor: InstallationSupervisor
  installationRegistry: InstallationRegistry
  connectorRegistry: ConnectorRegistry
}

// ============================================================================
// Bootstrap
// ============================================================================

export function bootstrapWorkspace(deps: ResolvedWorkspaceDeps): WorkspaceMax {
  return new WorkspaceMax({
    installationDeployer: deps.platform.installation.registry,
    installationSupervisor: deps.installationSupervisor,
    connectorRegistry: deps.connectorRegistry,
    installationRegistry: deps.installationRegistry
  })
}
