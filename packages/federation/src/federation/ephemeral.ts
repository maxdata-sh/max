/**
 * Ephemeral GlobalMax — All-in-memory factory for tests and platform-agnostic usage.
 *
 * Defines two resolver graphs (global + workspace) with in-memory defaults.
 * Callers can override individual nodes via `.with()` semantics, or provide
 * a custom installation deployer for tests that need real installations.
 *
 * Usage:
 *   const max = GlobalMax.ephemeral()
 *   await max.start()
 *
 *   // With installation support:
 *   const max = GlobalMax.ephemeral({
 *     installationDeployer: new DeployerRegistry('test', [
 *       new InlineDeployer(async () => myStubInstallation),
 *     ]),
 *   })
 */

import { ResolverGraph, type ResolverFactories, type Supervisor, type InstallationId } from '@max/core'
import { DefaultSupervisor } from './default-supervisor.js'
import { InMemoryWorkspaceRegistry, type WorkspaceRegistry } from './workspace-registry.js'
import { InMemoryInstallationRegistry, type InstallationRegistry } from './installation-registry.js'
import { InMemoryConnectorRegistry, type ConnectorRegistry } from '@max/connector'
import { DeployerRegistry, type InstallationDeployer } from '../deployers/index.js'
import { InlineDeployer } from './deployer-common/inline-deployer.js'
import { WorkspaceMax } from './workspace-max.js'
import { GlobalMax } from './global-max.js'

// ============================================================================
// Global Graph
// ============================================================================

export interface EphemeralGlobalDeps {
  workspaceRegistry: WorkspaceRegistry
  supervisor: Supervisor<any>
}

export const ephemeralGlobalGraph = ResolverGraph.define<{}, EphemeralGlobalDeps>({
  workspaceRegistry: () => new InMemoryWorkspaceRegistry(),
  supervisor: () => new DefaultSupervisor(() => crypto.randomUUID() as string),
})

// ============================================================================
// Workspace Graph
// ============================================================================

export interface EphemeralWorkspaceDeps {
  installationRegistry: InstallationRegistry
  connectorRegistry: ConnectorRegistry
  supervisor: Supervisor<any>
}

export const ephemeralWorkspaceGraph = ResolverGraph.define<{}, EphemeralWorkspaceDeps>({
  installationRegistry: () => new InMemoryInstallationRegistry(),
  connectorRegistry: () => new InMemoryConnectorRegistry(),
  supervisor: () => new DefaultSupervisor(() => crypto.randomUUID() as InstallationId),
})

// ============================================================================
// Overrides
// ============================================================================

export interface EphemeralOverrides {
  global?: Partial<ResolverFactories<{}, EphemeralGlobalDeps>>
  workspace?: Partial<ResolverFactories<{}, EphemeralWorkspaceDeps>>
  installationDeployer?: DeployerRegistry<InstallationDeployer>
}

// ============================================================================
// Factory
// ============================================================================

export function createEphemeralMax(overrides?: EphemeralOverrides): GlobalMax {
  const gGraph = overrides?.global ? ephemeralGlobalGraph.with(overrides.global) : ephemeralGlobalGraph
  const gDeps = gGraph.resolve({})

  const wGraph = overrides?.workspace ? ephemeralWorkspaceGraph.with(overrides.workspace) : ephemeralWorkspaceGraph
  const instDeployer = overrides?.installationDeployer ?? new DeployerRegistry('ephemeral', [])

  const wsDeployer = new InlineDeployer(async () => {
    const wDeps = wGraph.resolve({}) // fresh per workspace
    return new WorkspaceMax({
      installationSupervisor: wDeps.supervisor,
      installationRegistry: wDeps.installationRegistry,
      connectorRegistry: wDeps.connectorRegistry,
      installationDeployer: instDeployer,
    })
  })

  return new GlobalMax({
    workspaceRegistry: gDeps.workspaceRegistry,
    workspaceSupervisor: gDeps.supervisor,
    workspaceDeployer: new DeployerRegistry('ephemeral', [wsDeployer]),
  })
}
