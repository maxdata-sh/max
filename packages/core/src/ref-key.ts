/**
 * RefKey - A branded string that uniquely identifies a Ref.
 *
 * Format:
 *   Local:  "local:<entityType>:<entityId>"
 *   System: "system:<installationId>:<entityType>:<entityId>"
 */

import { type HardBrand, hardBrand } from "./brand.js";
import type { Scope, LocalScope, SystemScope } from "./scope.js";
import type { Id } from "./brand.js";
import {StaticTypeCompanion} from "./companion.js";

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

// ============================================================================
// Parsing Result
// ============================================================================

export type ParsedRefKey =
  | { scope: LocalScope; entityType: EntityType; entityId: EntityId }
  | { scope: SystemScope; entityType: EntityType; entityId: EntityId };

// ============================================================================
// RefKey Utilities
// ============================================================================

const DELIMITER = ":";

export const RefKey = StaticTypeCompanion({
  /**
   * Create a RefKey from components.
   */
  from(entityType: EntityType, entityId: EntityId, scope: Scope): RefKey {
    if (scope.kind === "local") {
      return hardBrand<RefKey>(`local${DELIMITER}${entityType}${DELIMITER}${entityId}`);
    } else {
      return hardBrand<RefKey>(
        `system${DELIMITER}${scope.installationId}${DELIMITER}${entityType}${DELIMITER}${entityId}`
      );
    }
  },

  /**
   * Create a local RefKey.
   */
  local(entityType: EntityType, entityId: EntityId): RefKey {
    return hardBrand<RefKey>(`local${DELIMITER}${entityType}${DELIMITER}${entityId}`);
  },

  /**
   * Create a system RefKey.
   */
  system(installationId: InstallationId, entityType: EntityType, entityId: EntityId): RefKey {
    return hardBrand<RefKey>(
      `system${DELIMITER}${installationId}${DELIMITER}${entityType}${DELIMITER}${entityId}`
    );
  },

  /**
   * Parse a RefKey string back into components.
   * Throws if the format is invalid.
   */
  parse(key: RefKey): ParsedRefKey {
    const parts = (key as string).split(DELIMITER);

    if (parts[0] === "local" && parts.length === 3) {
      return {
        scope: { kind: "local" },
        entityType: parts[1] as EntityType,
        entityId: parts[2] as EntityId,
      };
    }

    if (parts[0] === "system" && parts.length === 4) {
      return {
        scope: { kind: "system", installationId: parts[1] as InstallationId },
        entityType: parts[2] as EntityType,
        entityId: parts[3] as EntityId,
      };
    }

    throw new Error(`Invalid RefKey format: ${key}`);
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
