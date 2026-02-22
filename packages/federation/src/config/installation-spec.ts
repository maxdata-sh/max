/**
 * InstallationSpec — Provider-agnostic description of what an installation needs to be.
 *
 * This describes the desired state of an installation: which connector, what engine,
 * what credential store. It says nothing about *how* the installation is hosted.
 *
 * Each layer reads only the config it owns. Providers pass spec through to the node
 * without interpreting it. The node uses spec to wire its own internals.
 */

import type { ConnectorVersionIdentifier } from '@max/core'

// ============================================================================
// InstallationSpec
// ============================================================================

export interface InstallationSpec {
  /** Connector identifier, e.g. "@max/connector-hubspot", "@max/connector-linear". */
  readonly connector: ConnectorVersionIdentifier

  /** Installation slug. Auto-generated from connector if omitted. */
  readonly name?: string

  /** Connector-specific config (API keys, workspace IDs — from onboarding). Opaque to federation. */
  readonly connectorConfig?: unknown

  /** Pre-collected credentials to persist during installation creation. Opaque to federation. */
  readonly initialCredentials?: Record<string, string>
}
