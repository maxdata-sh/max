/**
 * Storage boundary — domain-owned errors for @max/storage-sqlite.
 */

import {MaxError, NotFound, NotImplemented, Invariant, HasEntityRef, HasField} from "@max/core";

// ============================================================================
// Boundary
// ============================================================================

export const Storage = MaxError.boundary("storage");

// ============================================================================
// Errors
// ============================================================================

/** Entity not found by ref */
export const ErrEntityNotFound = Storage.define("entity_not_found", {
  facets: [NotFound, HasEntityRef],
  message: (d) => `${d.entityType} not found: ${d.entityId}`,
});

/** Entity type not registered in schema */
export const ErrEntityNotRegistered = Storage.define("entity_not_registered", {
  facets: [Invariant],
  message: (d) => `Entity '${d.entityType}' not registered in schema`,
});

/** Field not found on entity */
export const ErrFieldNotFound = Storage.define("field_not_found", {
  facets: [NotFound, HasField],
  message: (d) => `Field '${d.field}' not found on ${d.entityType}`,
});

/** Collection loading not yet implemented */
export const ErrCollectionNotSupported = Storage.define("collection_not_supported", {
  facets: [NotImplemented],
  message: () => "loadCollection not yet implemented",
});

/** Collection field cannot be mapped to a SQL column */
export const ErrInvalidFieldMapping = Storage.define("invalid_field_mapping", {
  facets: [Invariant],
  message: () => "Cannot map collection field to SQL type",
});
