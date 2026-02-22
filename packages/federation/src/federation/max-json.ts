/**
 * On-disk schema types for max.json.
 *
 * These types describe the JSON structure of the max.json file.
 * See specs/SPEC-max-json.md for the full design rationale.
 */

import type {
  ConnectorVersionIdentifier,
  InstallationId,
  ISODateString,
  Locator,
  LocatorURI,
} from '@max/core'
import {DeploymentConfig} from "../deployers/index.js";
import {InstallationSpec} from "../config/index.js";

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
  readonly connector: ConnectorVersionIdentifier

  /** When this installation was first connected (ISO 8601). */
  readonly connectedAt: ISODateString

  /** Hosting metadata — platform + strategy. Omitted means legacy entry. */
  readonly spec: InstallationSpec
  readonly deployment: DeploymentConfig
  readonly locator: LocatorURI // <- this will get merged soon with hosting

}
