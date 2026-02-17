/**
 * Supervisor — Aggregates across ChildProviders.
 *
 * Provides a unified view of all children regardless of hosting type.
 * A workspace with 2 local installations and 1 remote installation has one
 * Supervisor that aggregates across providers. list() returns all 3.
 * health() checks all 3.
 *
 * The Supervisor does NOT know about deployment details. It works purely
 * with NodeHandles. It can report providerKind in diagnostics.
 *
 * Supervisor and ChildProvider are peers, not a hierarchy. A level-specific
 * orchestrator (e.g., WorkspaceMax) owns both and coordinates between them:
 *   1. Creating: orchestrator picks provider → provider.create() → supervisor.register()
 *   2. Listing: supervisor.list() aggregates across all providers
 *   3. Lifecycle: supervisor delegates start/stop to each handle
 *
 * @typeParam R - The supervised interface children expose
 * @typeParam TId - Parent-assigned identity type
 */

import type { Supervised, HealthStatus, HealthStatusKind } from "./supervised.js"
import type { NodeHandle } from "./node-handle.js"

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
  register(handle: NodeHandle<R, TId>): void
  unregister(id: TId): void
  get(id: TId): NodeHandle<R, TId> | undefined
  list(): NodeHandle<R, TId>[]
  health(): Promise<AggregateHealthStatus>
}
