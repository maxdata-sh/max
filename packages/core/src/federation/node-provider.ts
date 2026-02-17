/**
 * NodeProvider — Factory + type-specific supervisor for one deployment strategy.
 *
 * Each provider knows how to create or connect to children of one hosting type,
 * and how to supervise them using type-appropriate mechanisms.
 *
 * Providers are pluggable — the parent registers providers by target type.
 * Adding a new deployment strategy (e.g., DockerNodeProvider) doesn't require
 * modifying the parent or its Supervisor.
 *
 * Examples:
 *   - FsNodeProvider: spawns local Bun processes, PID files, Unix sockets
 *   - RemoteNodeProvider: connects to a URL, HTTP health, HTTP transport
 *   - DockerNodeProvider: spawns containers, Docker API, mapped ports
 *   - InProcessNodeProvider: instantiates in same process, no overhead
 *
 * @typeParam R - The supervised interface children expose
 * @typeParam TId - Parent-assigned identity type
 */

import type { Id } from "../brand.js"
import type { Supervised } from "./supervised.js"
import type { NodeHandle } from "./node-handle.js"

/**
 * Informational tag identifying the deployment strategy.
 * Soft-branded — string literals assign directly: `const kind: ProviderKind = "fs"`
 *
 * The Supervisor never branches on this. Used in health reports, logs, diagnostics.
 */
export type ProviderKind = Id<"provider-kind">

export interface NodeProvider<R extends Supervised, TId extends string = string> {
  readonly kind: ProviderKind

  /** Spawn or provision a new child. */
  create(config: unknown): Promise<NodeHandle<R, TId>>

  /** Bind to an existing child at a known location. */
  connect(location: unknown): Promise<NodeHandle<R, TId>>

  /** All children this provider currently manages. */
  list(): Promise<NodeHandle<R, TId>[]>
}
