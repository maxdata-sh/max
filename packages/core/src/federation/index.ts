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

// NodeHandle + UnlabelledHandle + IdGenerator
export type { NodeHandle, UnlabelledHandle, IdGenerator } from "./node-handle.js"

// ChildProvider + ProviderKind
export type { ProviderKind, NodeProvider } from "./node-provider.js"

// Supervisor + AggregateHealthStatus
export type { AggregateHealthStatus, Supervisor } from "./supervisor.js"

// RPC wire protocol
export { RpcResponse } from "./rpc.js"
export type { RpcRequest, ScopeRouting } from "./rpc.js"

// RPC errors
export { Rpc, ErrUnknownTarget, ErrUnknownMethod, ErrSyncHandleNotFound, ErrNodeNotFound } from "./rpc-errors.js"
