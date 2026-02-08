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
import {ErrInvalidRefKey} from "./errors/basic-errors.js";

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
    const str = key as string;
    const d1 = str.indexOf(DELIMITER);
    if (d1 === -1) throw ErrInvalidRefKey.create({ key: key as string });

    const scope = str.substring(0, d1);
    const d2 = str.indexOf(DELIMITER, d1 + 1);
    if (d2 === -1) throw ErrInvalidRefKey.create({ key: key as string });

    if (scope === "local") {
      return {
        scope: { kind: "local" },
        entityType: str.substring(d1 + 1, d2) as EntityType,
        entityId: str.substring(d2 + 1) as EntityId,
      };
    }

    if (scope === "system") {
      const d3 = str.indexOf(DELIMITER, d2 + 1);
      if (d3 === -1) throw ErrInvalidRefKey.create({ key: key as string });
      return {
        scope: { kind: "system", installationId: str.substring(d1 + 1, d2) as InstallationId },
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
