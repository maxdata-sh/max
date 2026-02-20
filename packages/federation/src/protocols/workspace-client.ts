/**
 * WorkspaceClient — Manages installations. Provides cross-installation operations.
 *
 * A workspace groups installations and provides unified access across them.
 *
 * Extends Supervised — every workspace exposes health/start/stop to its
 * parent (the global level).
 *
 * Supervisor is internal to WorkspaceMax — not exposed on the client surface.
 * The client has explicit intent-based methods instead (listInstallations,
 * createInstallation, removeInstallation). These work identically in-process
 * and over RPC.
 */

import type { InstallationId, Schema, Supervised } from "@max/core"
import type { ConnectorRegistryEntry, OnboardingFlowAny } from "@max/connector"
import type { InstallationClient } from "./installation-client.js"
import type { InstallationInfo } from "../federation/installation-registry.js"
import type { InstallationSpec } from "../config/installation-spec.js"
import type { HostingConfig, RemoteHostingConfig } from "../config/hosting-config.js"

export interface WorkspaceClient extends Supervised {
  /** List all installations in this workspace. */
  listInstallations(): Promise<InstallationInfo[]>

  /** Synchronous lookup of a single installation by its parent-assigned ID. */
  installation(id: InstallationId): InstallationClient | undefined

  /** Create a new installation from spec + optional hosting config. */
  createInstallation(config: CreateInstallationConfig): Promise<InstallationId>

  /** Connect to a pre-existing remote installation. */
  connectInstallation(config: ConnectInstallationConfig): Promise<InstallationId>

  /** Tear down and remove an installation. */
  removeInstallation(id: InstallationId): Promise<void>

  /** List available connectors in this workspace. */
  listConnectors(): Promise<ConnectorRegistryEntry[]>

  /** Get the schema for a connector (pre-installation). */
  connectorSchema(connector: string): Promise<Schema>

  /** Get the onboarding flow for a connector (pre-installation). */
  connectorOnboarding(connector: string): Promise<OnboardingFlowAny>
}

/**
 * Config for creating a new installation.
 *
 * `spec` describes what the installation is (connector, engine, credentials).
 * `hosting` describes where it runs (in-process, subprocess, etc.).
 * If hosting is omitted, the workspace's default hosting strategy is used.
 */
export interface CreateInstallationConfig {
  readonly spec: InstallationSpec
  readonly hosting?: HostingConfig
}

/**
 * Config for connecting to a pre-existing installation.
 *
 * Remote is the only connect-only type — the node already exists
 * with its own internal wiring. After connecting, the workspace calls
 * describe() on the node to learn what connector it is.
 */
export interface ConnectInstallationConfig {
  readonly hosting: RemoteHostingConfig
  /** Optional name override. Falls back to the node's self-reported name. */
  readonly name?: string
}
