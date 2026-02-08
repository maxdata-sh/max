/**
 * Standard facets and domain-owned error definitions for the core boundary.
 *
 * Facets are reusable markers/data traits composed into any ErrorDef.
 * Every error here is owned by the Core boundary — no generic catch-alls.
 */

import {ErrFacet, MaxError} from "../max-error.js";

// ============================================================================
// Core Boundary
// ============================================================================

export const Core = MaxError.boundary("core");

// ============================================================================
// Standard Facets
// ============================================================================

/** Something expected was not found */
export const NotFound = ErrFacet.marker("NotFound");

/** Caller provided invalid input */
export const BadInput = ErrFacet.marker("BadInput");

/** Code path not yet implemented */
export const NotImplemented = ErrFacet.marker("NotImplemented");

/** Internal invariant violated — always a bug */
export const Invariant = ErrFacet.marker("Invariant");

/** Carries an entity reference (type + id) */
export const HasEntityRef = ErrFacet.data<{ entityType: string; entityId: string }>("HasEntityRef");

/** Carries an entity type + field name */
export const HasField = ErrFacet.data<{ entityType: string; field: string }>("HasField");

/** Carries a loader name */
export const HasLoaderName = ErrFacet.data<{ loaderName: string }>("HasLoaderName");

// ============================================================================
// Standard Error Definitions
// ============================================================================

/** RefKey string could not be parsed */
export const ErrInvalidRefKey = Core.define("invalid_ref_key", {
  facets: [BadInput],
  message: (d) => `Invalid RefKey format: ${d.key}`,
});

/** Accessed a field that was not loaded */
export const ErrFieldNotLoaded = Core.define("field_not_loaded", {
  facets: [Invariant, HasField],
  message: (d) => `Field '${d.field}' not loaded on ${d.entityType}`,
});

/** Loader result not available in dependency map */
export const ErrLoaderResultNotAvailable = Core.define("loader_result_not_available", {
  facets: [NotFound, HasLoaderName],
  message: (d) => `Loader result not available: ${d.loaderName}`,
});

/** Context build failed (direct instantiation, invalid descriptor, or missing field) */
export const ErrContextBuildFailed = Core.define("context_build_failed", {
  facets: [BadInput],
  message: () => "Context build failed",
});

/** Batch.getOrThrow called with a key that has no value */
export const ErrBatchKeyMissing = Core.define("batch_key_missing", {
  facets: [NotFound],
  message: (d) => `Batch value missing for key: ${d.key}`,
});

/** Operation attempted on an empty batch */
export const ErrBatchEmpty = Core.define("batch_empty", {
  facets: [Invariant],
  message: () => "Empty batch has no keys",
});
