/**
 * Execution boundary — shared domain-owned errors for the execution layer.
 *
 * Used by @max/execution-local and @max/execution-sqlite.
 */

import {MaxError, NotFound, NotImplemented, Invariant, HasField, HasLoaderName} from "@max/core";

// ============================================================================
// Boundary
// ============================================================================

export const Execution = MaxError.boundary("execution");

// ============================================================================
// Errors
// ============================================================================

/** Entity type not found in the execution registry */
export const ErrUnknownEntityType = Execution.define("unknown_entity_type", {
  facets: [NotFound],
  message: (d) => `Unknown entity type: ${d.entityType}`,
});

/** No resolver registered for entity type */
export const ErrNoResolver = Execution.define("no_resolver", {
  facets: [NotFound],
  message: (d) => `No resolver for entity: ${d.entityType}`,
});

/** No collection loader for field */
export const ErrNoCollectionLoader = Execution.define("no_collection_loader", {
  facets: [NotFound, HasField],
  message: (d) => `No collection loader for field '${d.field}' on ${d.entityType}`,
});

/** Task not found in task store */
export const ErrTaskNotFound = Execution.define("task_not_found", {
  facets: [NotFound],
  message: (d) => `Task not found: ${d.taskId}`,
});

/** Loader has dependencies but dependency resolution is not yet supported */
export const ErrLoaderDepsNotSupported = Execution.define("loader_deps_not_supported", {
  facets: [NotImplemented, HasLoaderName],
  message: (d) => `Loader "${d.loaderName}" has dependencies, but loader dependency resolution is not yet supported`,
});

/** Loader dependency results not available */
export const ErrNoDepsAvailable = Execution.define("no_deps_available", {
  facets: [Invariant, HasLoaderName],
  message: (d) => `No deps available: ${d.loaderName}`,
});
