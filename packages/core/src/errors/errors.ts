/**
 * Standard facets and domain-owned error definitions for the core boundary.
 *
 * Facets are reusable markers/data traits composed into any ErrorDef.
 * Every error here is owned by the Core boundary — no generic catch-alls.
 */

import {ErrFacet, MaxError} from "../max-error.js";
import {Execution} from "@max/execution";
import {LoaderName} from "../loader.js";
import { EntityId, EntityType } from '../core-id-types.js'

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
export const NotSupported = ErrFacet.marker("NotSupported")

export const NotAvailable = ErrFacet.marker('NotAvailable')

/** Internal invariant violated — always a bug */
export const InvariantViolated = ErrFacet.marker("InvariantViolated");

/** Carries an entity reference (type + id) */
export const HasEntityRef = ErrFacet.data<{ entityType: EntityType; entityId: EntityId }>("HasEntityRef");

/** Carries an entity type + field name */
export const HasEntityField = ErrFacet.data<{ entityType: EntityType; field: string }>("HasEntityField");
export const HasEntityType = ErrFacet.data<{ entityType: EntityType; }>("HasEntityType");

/** Carries a loader name */
export const HasLoaderName = ErrFacet.data<{ loaderName: LoaderName }>("HasLoaderName");

export const HasConnector = ErrFacet.data<{ connector: string }>("HasConnector");

// ============================================================================
// Standard Error Definitions
// ============================================================================

/** RefKey string could not be parsed */
export const ErrInvalidRefKey = Core.define("invalid_ref_key", {
  customProps: ErrFacet.props<{ key: string }>(),
  facets: [BadInput],
  message: (d) => `Invalid RefKey format: ${d.key}`,
});

export const ErrNotImplemented = Core.define("not_implemented", {
  facets:[NotImplemented],
  message: () => "Not implemented!"
})

export const ErrNotSupported = Core.define('not_supported', {
  facets: [NotSupported],
  message: () => 'Operation not supported',
})

export const ErrConfigNotSupported = Core.define('config_not_supported', {
  customProps: ErrFacet.props<{ kind: string, config: object }>(),
  facets: [NotSupported],
  message: () => 'Encountered unsupported config',
})

/** Accessed a field that was not loaded */
export const ErrFieldNotLoaded = Core.define("field_not_loaded", {
  facets: [HasEntityField],
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
  customProps: ErrFacet.props<{ key: string }>(),
  facets: [NotFound],
  message: (d) => `Batch value missing for key: ${d.key}`,
});

/** Operation attempted on an empty batch */
export const ErrBatchEmptyDeriveKey = Core.define("batch_empty_derive_key", {
  facets: [InvariantViolated],
  message: () => "Invalid call: Cannot infer key of empty batch",
});


export const ErrUnknownEntityType = Core.define("unknown_entity_type", {
  facets: [HasEntityType],
  message: (d) => `Unknown entity type: ${d.entityType}`,
});

/** Root entity not found in entities list during schema creation */
export const ErrRootNotInEntities = Core.define("root_not_in_entities", {
  customProps: ErrFacet.props<{ root: string }>(),
  facets: [BadInput],
  message: (d) => `Root entity "${d.root}" is not in the entities list`,
});

/** Printer key has no registered implementation */
export const ErrPrinterNotRegistered = Core.define("printer_not_registered", {
  customProps: ErrFacet.props<{ key: string }>(),
  facets: [NotFound],
  message: (d) => `No printer registered for "${d.key}"`,
});
