/**
 * HostingConfig — How a node should be hosted.
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

import type { Id } from '@max/core'

// ============================================================================
// Strategy
// ============================================================================

/** Hosting strategy — routing key in the workspace's provider map. Soft-branded. */
export type HostingStrategy = Id<"hosting-strategy">

// ============================================================================
// HostingConfig
// ============================================================================

/**
 * Base hosting config. The workspace needs `strategy` for routing;
 * platform-specific fields are opaque at the federation level.
 */
export interface HostingConfig {
  readonly strategy: HostingStrategy
}

/** In-process hosting — same runtime, no serialization boundary. */
export interface InProcessHostingConfig extends HostingConfig {
  readonly strategy: "in-process"
}

/** Subprocess hosting — child process on the same machine. */
export interface SubprocessHostingConfig extends HostingConfig {
  readonly strategy: "subprocess"
}

// ============================================================================
// Platform
// ============================================================================

/** Platform name — which runtime environment hosts this node. Soft-branded. */
export type PlatformName = Id<"platform-name">

// ============================================================================
// Serialised hosting — persistence format
// ============================================================================

/**
 * Serialised installation hosting. Stored in registry entries and max.json.
 * The `installation` object uses an index signature because it's a persistence
 * type — it holds platform-specific fields opaquely.
 */
export interface SerialisedInstallationHosting {
  readonly platform: PlatformName
  readonly installation: {
    readonly strategy: string
    readonly [key: string]: unknown
  }
}

/**
 * Serialised workspace hosting. Same shape, workspace-level.
 */
export interface SerialisedWorkspaceHosting {
  readonly platform: PlatformName
  readonly workspace: {
    readonly strategy: string
    readonly [key: string]: unknown
  }
}
