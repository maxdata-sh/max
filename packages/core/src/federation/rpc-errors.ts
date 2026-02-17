/**
 * RPC boundary errors — errors originating from the RPC dispatch layer.
 *
 * These are thrown by dispatchers when routing fails (unknown target,
 * unknown method, missing handle). They use the standard facet system
 * so callers can catch by facet (BadInput, NotFound) or by boundary (Rpc).
 */

import { MaxError, ErrFacet } from "../max-error.js"
import { BadInput, NotFound } from "../errors/errors.js"

export const Rpc = MaxError.boundary("rpc")

/** Request targeted an unknown sub-object */
export const ErrUnknownTarget = Rpc.define("unknown_target", {
  customProps: ErrFacet.props<{ target: string }>(),
  facets: [BadInput],
  message: (d) => `Unknown RPC target "${d.target}"`,
})

/** Request called an unknown method on a known target */
export const ErrUnknownMethod = Rpc.define("unknown_method", {
  customProps: ErrFacet.props<{ target: string; method: string }>(),
  facets: [BadInput],
  message: (d) => `Unknown method "${d.method}" on target "${d.target}"`,
})

/** Sync handle operation referenced a non-existent handle */
export const ErrSyncHandleNotFound = Rpc.define("sync_handle_not_found", {
  customProps: ErrFacet.props<{ syncId: string }>(),
  facets: [NotFound],
  message: (d) => `No sync handle with id "${d.syncId}"`,
})

/** Scope routing referenced a node that doesn't exist */
export const ErrNodeNotFound = Rpc.define("node_not_found", {
  customProps: ErrFacet.props<{ id: string }>(),
  facets: [NotFound],
  message: (d) => `Node not found: "${d.id}"`,
})
