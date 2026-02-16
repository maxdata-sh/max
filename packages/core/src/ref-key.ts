/**
 * RefKey - A branded string that uniquely identifies a Ref.
 *
 * Format:
 *   Installation:  "ein:<entityType>:<entityId>"
 *   Workspace:     "ews:<installationId>:<entityType>:<entityId>"
 */

import { type HardBrand, hardBrand } from "./brand.js";
import { Scope, InstallationScope, WorkspaceScope } from './scope.js'
import type { Id } from "./brand.js";
import {StaticTypeCompanion} from "./companion.js";
import {ErrInvalidRefKey} from "./errors/errors.js";

// ============================================================================
// Types
// ============================================================================

/**
 * RefKey is a hard-branded string - must be created via RefKey.from() or RefKey.parse().
 */
export type RefKey = HardBrand<string, "ref-key">;

export type EntityType = Id<"entity-type">;
export type EntityId = Id<"entity-id">;
export type InstallationId = Id<"installation-id">;
export type WorkspaceId = Id<"workspace-id">;
export type ConnectorType = Id<"connector-type">;

// ============================================================================
// Parsing Result
// ============================================================================

export type ParsedRefKey =
  | { scope: InstallationScope; entityType: EntityType; entityId: EntityId }
  | { scope: WorkspaceScope; entityType: EntityType; entityId: EntityId };

// ============================================================================
// RefKey Utilities
// ============================================================================

const DELIMITER = ":";

const ScopePrefix = {
  installation: 'ein',
  workspace: 'ews'
} satisfies Record<Scope['kind'], string>

const keyed = (...args:string[]): RefKey => args.join(DELIMITER) as RefKey;

export const RefKey = StaticTypeCompanion({
  /**
   * Create a RefKey from components.
   */
  from(entityType: EntityType, entityId: EntityId, scope: Scope): RefKey {
    if (Scope.isInstallation(scope)) {
      return keyed(ScopePrefix.installation, entityType, entityId)
    } else {
      return keyed(ScopePrefix.workspace, scope.installationId, entityType, entityId)
    }
  },

  /**
   * Create an installation RefKey.
   */
  installation(entityType: EntityType, entityId: EntityId): RefKey {
    return keyed(ScopePrefix.installation, entityType, entityId)
  },

  /**
   * Create a system RefKey.
   */
  workspace(installationId: InstallationId, entityType: EntityType, entityId: EntityId): RefKey {
    return keyed(ScopePrefix.workspace, installationId, entityType, entityId)
  },

  /**
   * Parse a RefKey string back into components.
   * Throws if the format is invalid.
   */
  parse(key: RefKey): ParsedRefKey {
    const str = key as string;
    const d1 = str.indexOf(DELIMITER);
    if (d1 === -1) throw ErrInvalidRefKey.create({ key: key as string });

    const scope = str.substring(0, d1);
    const d2 = str.indexOf(DELIMITER, d1 + 1);
    if (d2 === -1) throw ErrInvalidRefKey.create({ key: key as string });

    if (scope === ScopePrefix.installation) {
      return {
        scope: Scope.installation(),
        entityType: str.substring(d1 + 1, d2) as EntityType,
        entityId: str.substring(d2 + 1) as EntityId,
      }
    }

    if (scope === ScopePrefix.workspace) {
      const d3 = str.indexOf(DELIMITER, d2 + 1);
      if (d3 === -1) throw ErrInvalidRefKey.create({ key: key as string });
      const installationId: InstallationId = str.substring(d1 + 1, d2)
      return {
        scope: Scope.workspace(installationId),
        entityType: str.substring(d2 + 1, d3) as EntityType,
        entityId: str.substring(d3 + 1) as EntityId,
      };
    }

    throw ErrInvalidRefKey.create({ key: key as string });
  },

  /**
   * Try to parse a string as a RefKey.
   * Returns undefined if invalid.
   */
  tryParse(str: string): ParsedRefKey | undefined {
    try {
      return RefKey.parse(str as RefKey);
    } catch {
      return undefined;
    }
  },

  /**
   * Check if a string is a valid RefKey format.
   */
  isValid(str: string): str is RefKey {
    return RefKey.tryParse(str) !== undefined;
  },
})
