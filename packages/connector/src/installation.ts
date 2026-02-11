/**
 * Installation — A live, configured instance of a connector.
 *
 * Built by ConnectorModule.initialise(). Owns its context and lifecycle.
 */

import { StaticTypeCompanion } from "@max/core";
import type { ContextDefAny, InferContext } from "@max/core";

// ============================================================================
// HealthStatus
// ============================================================================

export type HealthStatus =
  | { status: "healthy" }
  | { status: "degraded"; reason: string }
  | { status: "unhealthy"; reason: string };

// ============================================================================
// Installation Interface
// ============================================================================

export interface Installation {
  /** Context for this installation (used by the platform to run loaders) */
  readonly context: unknown;

  /** Start the installation (e.g. refresh schedulers, background tasks) */
  start(): Promise<void>;

  /** Stop the installation */
  stop(): Promise<void>;

  /** Health check */
  health(): Promise<HealthStatus>;
}

// ============================================================================
// Installation Static Methods
// ============================================================================

export const Installation = StaticTypeCompanion({
  create(opts: {
    context: unknown;
    start?: () => Promise<void>;
    stop?: () => Promise<void>;
    health?: () => Promise<HealthStatus>;
  }): Installation {
    return {
      context: opts.context,
      start: opts.start ?? (() => Promise.resolve()),
      stop: opts.stop ?? (() => Promise.resolve()),
      health: opts.health ?? (() => Promise.resolve({ status: "healthy" })),
    };
  },
});
