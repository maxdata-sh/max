/**
 * Data types for the ProjectManager service.
 *
 * All types here are pure DTOs — no methods, no service references, no side effects.
 */

import type { InstallationId } from "@max/core";

// ============================================================================
// PendingInstallation
// ============================================================================

/**
 * A prepared but uncommitted installation.
 * Has a connector name and slug but no config, no ID, and is not persisted.
 */
export interface PendingInstallation {
  readonly connector: string;
  readonly name: string;
}

// ============================================================================
// ManagedInstallation
// ============================================================================

/**
 * A committed installation with an assigned ID and persisted config.
 */
export interface ManagedInstallation {
  readonly connector: string;
  readonly name: string;
  readonly id: InstallationId;
  readonly config: unknown;
  readonly connectedAt: string; // ISO 8601
}

// ============================================================================
// InstallationInfo
// ============================================================================

/**
 * Lightweight summary for listing. Omits config.
 */
export interface InstallationInfo {
  readonly connector: string;
  readonly name: string;
  readonly id: InstallationId;
  readonly connectedAt: string;
}
