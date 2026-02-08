/**
 * Standard facets and error definitions for core.
 *
 * Facets are reusable markers/data traits that can be composed into any ErrorDef.
 * Error definitions here are domain-agnostic — connectors and apps define their own.
 */

import {ErrFacet, MaxError} from "../max-error.js";

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

// ============================================================================
// Standard Error Definitions
// ============================================================================

/** Generic not-found error. Use when no entity-specific info is available. */
export const ErrNotFound = MaxError.define("core.not_found", {
  facets: [NotFound],
  message: () => "Not found",
});

/** An entity was not found by type + id */
export const ErrEntityNotFound = MaxError.define("core.entity_not_found", {
  facets: [NotFound, HasEntityRef],
  message: (d) => `${d.entityType} not found: ${d.entityId}`,
});

/** Caller-supplied data failed validation */
export const ErrBadInput = MaxError.define("core.bad_input", {
  facets: [BadInput],
  message: () => "Bad input",
});

/** A code path that hasn't been implemented yet */
export const ErrNotImplemented = MaxError.define("core.not_implemented", {
  facets: [NotImplemented],
  message: () => "Not implemented",
});

/** An internal invariant was violated. Always indicates a bug. */
export const ErrInvariant = MaxError.define("core.invariant", {
  facets: [Invariant],
  message: () => "Invariant violated",
});
