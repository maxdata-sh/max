/**
 * Federation — Level-agnostic infrastructure abstractions.
 *
 * These provide the uniform operational surface shared by every boundary
 * in the federation hierarchy (Global → Workspace → Installation).
 */

// Supervised + result types
export { HealthStatus, StartResult, StopResult } from "./supervised.js"
export type {
  HealthStatusKind,
  StartOutcome,
  StopOutcome,
  Supervised,
} from "./supervised.js"

// Transport
export type { Transport } from "./transport.js"

// NodeHandle
export type { NodeHandle } from "./node-handle.js"

// ChildProvider + ProviderKind
export type { ProviderKind, ChildProvider } from "./child-provider.js"

// Supervisor + AggregateHealthStatus
export type { AggregateHealthStatus, Supervisor } from "./supervisor.js"
