/**
 * HostingStrategy — How a node should be hosted within a platform.
 *
 * The `strategy` field is the discriminant that routes to the correct provider
 * at the workspace level. Strategies are capabilities of a platform — the
 * workspace doesn't know which platform provides them.
 *
 * Common strategies:
 *   - "in-process" — same process, no serialization boundary
 *   - "subprocess" — child process on the same machine
 *
 * Platforms may define additional strategies (e.g., "container", "remote").
 * The workspace's provider map accepts any HostingStrategy value.
 *
 * Hosting is orthogonal to the installation spec. The spec says *what*,
 * hosting says *where*.
 */


import type {Id} from "@max/core";

/** Hosting strategy — routing key in the workspace's provider map. Soft-branded. */
export type HostingStrategyName = Id<'hosting-strategy'>

/**
 * Base hosting config. The workspace needs `strategy` for routing;
 * platform-specific fields are opaque at the federation level.
 */
export interface HostingStrategy {
  readonly strategy: HostingStrategyName
  /** [key: string]: unknown */ // A HostingStrategy comes with its own bag of configuration properties

}
