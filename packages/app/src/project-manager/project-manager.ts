/**
 * ProjectManager — interface for managing connector installations within a Max project.
 */

import type { CredentialStore } from "@max/connector";
import type { ConnectorType } from "@max/core";
import type { PendingInstallation, ManagedInstallation, InstallationInfo } from "./types.js";

export interface ProjectManager {
  /** Get the path to the data DB for an installation. */
  dataPathFor(installation: ManagedInstallation): string;

  /** Create a pending installation. Not persisted until commit. */
  prepare(connector: ConnectorType, name?: string): PendingInstallation;

  /** Persist a pending installation with its config. Returns the committed installation. */
  commit(pending: PendingInstallation, config: unknown): Promise<ManagedInstallation>;

  /** Get the credential store scoped to an installation (pending or committed). */
  credentialStoreFor(installation: PendingInstallation | ManagedInstallation): CredentialStore;

  /** Load an existing installation by connector and optional slug. */
  get(connector: ConnectorType, name?: string): ManagedInstallation;

  /** Check if an installation exists for a connector (optionally with a specific slug). */
  has(connector: ConnectorType, name?: string): boolean;

  /** List all committed installations. */
  list(): InstallationInfo[];

  /** Remove an installation and its associated credentials. */
  delete(connector: ConnectorType, name?: string): Promise<void>;
}
