/**
 * InstallationSpec — Provider-agnostic description of what an installation needs to be.
 *
 * This describes the desired state of an installation: which connector, what engine,
 * what credential store. It says nothing about *how* the installation is hosted.
 *
 * Each layer reads only the config it owns. Providers pass spec through to the node
 * without interpreting it. The node uses spec to wire its own internals.
 */

import type { ConnectorType } from '@max/core'

// ============================================================================
// Sub-configs
// ============================================================================

export type EngineConfig =
  | { type: "sqlite" }
  | { type: "sqlite"; path: string }
  | { type: "postgres"; connection: string }
  | { type: "in-memory" }

export type CredentialStoreConfig =
  | { type: "fs" }
  | { type: "fs"; path: string }
  | { type: "in-memory" }
  | { type: "vault"; url: string }

// ============================================================================
// InstallationSpec
// ============================================================================

export interface InstallationSpec {
  /** Connector identifier, e.g. "hubspot", "linear". */
  readonly connector: ConnectorType

  /** Installation slug. Auto-generated from connector if omitted. */
  readonly name?: string

  /** Engine configuration. Defaults to sqlite if omitted. */
  readonly engine?: EngineConfig

  /** Credential store configuration. Defaults to fs if omitted. */
  readonly credentials?: CredentialStoreConfig

  /** Connector-specific config (API keys, workspace IDs — from onboarding). Opaque to federation. */
  readonly connectorConfig?: unknown

  /** Pre-collected credentials to persist during installation creation. Opaque to federation. */
  readonly initialCredentials?: Record<string, string>
}
