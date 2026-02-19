/**
 * Supervisor — The sole registry of live labelled handles.
 *
 * Provides a unified view of all children regardless of hosting type.
 * A workspace with 2 local installations and 1 remote installation has one
 * Supervisor that aggregates across providers. list() returns all 3.
 * health() checks all 3.
 *
 * The Supervisor assigns identity. When a provider returns an UnlabelledHandle,
 * the parent calls supervisor.register() which stamps it with an ID (via an
 * injected IdGenerator) and returns a NodeHandle.
 *
 * The Supervisor does NOT know about deployment details. It works purely
 * with handles. It can report providerKind in diagnostics.
 *
 * @typeParam R - The supervised interface children expose
 * @typeParam TId - Parent-assigned identity type
 */

import type { Supervised, HealthStatus, HealthStatusKind } from "./supervised.js"
import type { NodeHandle, UnlabelledHandle } from "./node-handle.js"

// ============================================================================
// AggregateHealthStatus
// ============================================================================

export interface AggregateHealthStatus {
  readonly status: HealthStatusKind
  readonly children: ReadonlyMap<string, HealthStatus>
}

// ============================================================================
// Supervisor
// ============================================================================

export interface Supervisor<R extends Supervised, TId extends string = string> {
  /** Register an unlabelled handle, assigning a new ID. Returns the labelled handle. */
  register(handle: UnlabelledHandle<R>): NodeHandle<R, TId>
  /** Register an unlabelled handle with a specific ID (for startup reconciliation). */
  register(handle: UnlabelledHandle<R>, id: TId): NodeHandle<R, TId>

  unregister(id: TId): void
  get(id: TId): NodeHandle<R, TId> | undefined
  list(): NodeHandle<R, TId>[]
  health(): Promise<AggregateHealthStatus>
}
