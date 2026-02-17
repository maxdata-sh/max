/**
 * RPC wire protocol — shared contract between proxies and dispatchers.
 *
 * Proxies construct RpcRequest messages and send them via Transport.
 * Dispatchers receive them, route to real implementations, and return
 * RpcResponse messages.
 *
 * These types are transport-agnostic — they define the message shape,
 * not how it moves over the wire.
 */

import type { InstallationId, WorkspaceId } from '../ref-key.js'
import { SerializedError } from '../max-error.js'
import {StaticTypeCompanion} from "../companion.js";

// ============================================================================
// Request
// ============================================================================

/**
 * A single RPC method call.
 *
 * `id` is unique per request for response matching (persistent connection multiplexing).
 *
 * `target` routes to a sub-object within one node:
 *   - ""        → root (Supervised methods + protocol-specific: sync, schema)
 *   - "engine"  → the node's Engine
 *
 * Flat string. Never a dotted path. Never a compound routing expression.
 * Identifies a sub-object within ONE node — cross-node routing is in `scope`.
 */
export interface RpcRequest {
  readonly id: string
  readonly target: string
  readonly method: string
  readonly args: readonly unknown[]
  readonly scope?: ScopeRouting
}

/**
 * Routing context for requests flowing down the hierarchy.
 *
 * Mirrors the scope system: scope upgrade stamps identity on data flowing UP;
 * scope routing identifies which child to reach for requests flowing DOWN.
 *
 * Each field corresponds to one level in the federation.
 * A request from Global → Workspace → Installation accumulates both fields.
 * Each dispatcher strips its own field and forwards the rest.
 */
export interface ScopeRouting {
  readonly workspaceId?: WorkspaceId
  readonly installationId?: InstallationId
}

// ============================================================================
// Response
// ============================================================================

export type RpcResponse =
  | { readonly id: string; readonly ok: true; readonly result: unknown }
  | { readonly id: string; readonly ok: false; readonly error: SerializedError }

export const RpcResponse = StaticTypeCompanion({
  ok(id: string, result: unknown): RpcResponse {
    return { id, ok: true, result }
  },

  error(id: string, error: SerializedError): RpcResponse {
    return { id, ok: false, error }
  },
})
