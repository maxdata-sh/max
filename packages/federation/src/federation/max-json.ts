/**
 * On-disk schema types for max.json.
 *
 * These types describe the JSON structure of the max.json file.
 * See specs/SPEC-max-json.md for the full design rationale.
 */

import type { ConnectorType, InstallationId, ISODateString } from '@max/core'
import type { SerialisedInstallationHosting } from '../config/hosting-config.js'

/**
 * Root structure of a max.json file.
 */
export interface MaxJsonFile {
  /** Alias table for non-standard connector sources (git, local paths). */
  readonly connectors?: Record<string, string>

  /** Named installation entries. Key is the installation name (slug). */
  readonly installations?: Record<string, MaxJsonInstallation>
}

/**
 * A single installation entry as stored in max.json.
 * The installation name comes from the parent object key, not from this type.
 */
export interface MaxJsonInstallation {
  /** Parent-assigned UUID, stable across restarts. */
  readonly id: InstallationId

  /** Connector package with optional version tag, e.g. "@max/connector-linear@1.2.0". */
  readonly connector: ConnectorType

  /** When this installation was first connected (ISO 8601). */
  readonly connectedAt: ISODateString

  /** Hosting metadata — platform + strategy. Omitted means legacy entry. */
  readonly hosting?: SerialisedInstallationHosting

  /** Non-secret connector configuration. */
  readonly config?: unknown

  // Legacy fields (pre-federation). Read for backward compat, never written.
  /** @deprecated Use hosting.installation.strategy */
  readonly provider?: string
  /** @deprecated Use hosting */
  readonly location?: unknown
}
