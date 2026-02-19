/**
 * NodeProvider — Stateless factory for one deployment strategy.
 *
 * Each provider knows how to create or connect to nodes of one hosting type.
 * It returns an UnlabelledHandle — a live node without identity. The parent
 * (via its Supervisor) assigns the ID after the fact.
 *
 * Providers are pluggable — the parent registers providers by target type.
 * Adding a new deployment strategy (e.g., DockerNodeProvider) doesn't require
 * modifying the parent or its Supervisor.
 *
 * The provider has no memory of what it's created. It doesn't list anything.
 * It doesn't assign IDs. It's a stateless factory.
 *
 * Examples:
 *   - SubprocessNodeProvider: spawns local Bun processes, Unix sockets
 *   - RemoteNodeProvider: connects to a URL, HTTP transport
 *   - DockerNodeProvider: spawns containers, Docker API, mapped ports
 *   - InProcessNodeProvider: instantiates in same process, no overhead
 *
 * @typeParam R - The supervised interface children expose
 * @typeParam TConfig - Provider-specific configuration for spawning
 */

import type { Id } from "../brand.js"
import type { Supervised } from "./supervised.js"
import type { UnlabelledHandle } from "./node-handle.js"

/**
 * Informational tag identifying the deployment strategy.
 * Soft-branded — string literals assign directly: `const kind: ProviderKind = "fs"`
 *
 * The Supervisor never branches on this. Used in health reports, logs, diagnostics.
 */
export type ProviderKind = Id<"provider-kind">

export interface NodeProvider<R extends Supervised, TConfig = unknown> {
  readonly kind: ProviderKind

  /** Spawn or provision a new node. Returns an unlabelled handle (no ID). */
  create(config: TConfig): Promise<UnlabelledHandle<R>>

  /** Bind to an existing node at a known location. Returns an unlabelled handle (no ID). */
  connect(location: unknown): Promise<UnlabelledHandle<R>>
}
