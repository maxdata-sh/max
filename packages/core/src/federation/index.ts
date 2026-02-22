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
export * from "./node-handle.js"

export type { NodeProvider } from "./node-provider.js"

// Supervisor + AggregateHealthStatus
export type { AggregateHealthStatus, Supervisor } from "./supervisor.js"

// RPC wire protocol
export { RpcResponse } from "./rpc.js"
export type { RpcRequest, ScopeRouting } from "./rpc.js"

// RPC errors
export { Rpc, ErrUnknownTarget, ErrUnknownMethod, ErrSyncHandleNotFound, ErrNodeNotFound } from "./rpc-errors.js"

export { DeployerKind } from './deployer.js'
export type { ConfigOf, Deployer } from './deployer.js'


// FIXME BIG FIXME: As soon as we're stable, we need to move all the federation stuff from @max/core into @max/federation
