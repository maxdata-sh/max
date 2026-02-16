/**
 * Supervised — The contract a child exposes to its parent.
 *
 * Every child in the federation hierarchy (installation, workspace) implements
 * Supervised. The parent calls these methods through a ChildHandle — it never
 * sees the child's internal implementation.
 *
 * Distinct from Lifecycle (internal composition ordering). A concrete node may
 * implement both: Supervised for the parent-facing boundary, Lifecycle for
 * internal dependency ordering of its own subcomponents.
 *
 * Return types communicate outcomes:
 *   - StartResult/StopResult: lifecycle outcomes (success, already running, refused, error)
 *   - HealthStatus: current operational state
 *   - Transport errors (thrown/rejected): child is unreachable — distinct from lifecycle errors
 */

import { StaticTypeCompanion } from "../companion.js"

// ============================================================================
// HealthStatus
// ============================================================================

export type HealthStatusKind = "healthy" | "degraded" | "unhealthy"

export interface HealthStatus {
  readonly status: HealthStatusKind
  readonly reason?: string
}

export const HealthStatus = StaticTypeCompanion({
  healthy(): HealthStatus {
    return { status: "healthy" }
  },

  degraded(reason?: string): HealthStatus {
    return { status: "degraded", reason }
  },

  unhealthy(reason?: string): HealthStatus {
    return { status: "unhealthy", reason }
  },
})

// ============================================================================
// StartResult
// ============================================================================

export type StartOutcome = "started" | "already_running" | "refused" | "error"

export type StartResult =
  | { readonly outcome: "started" }
  | { readonly outcome: "already_running" }
  | { readonly outcome: "refused"; readonly reason: string }
  | { readonly outcome: "error"; readonly error: Error }

export const StartResult = StaticTypeCompanion({
  started(): StartResult {
    return { outcome: "started" }
  },

  alreadyRunning(): StartResult {
    return { outcome: "already_running" }
  },

  refused(reason: string): StartResult {
    return { outcome: "refused", reason }
  },

  error(error: Error): StartResult {
    return { outcome: "error", error }
  },
})

// ============================================================================
// StopResult
// ============================================================================

export type StopOutcome = "stopped" | "already_stopped" | "refused" | "error"

export type StopResult =
  | { readonly outcome: "stopped" }
  | { readonly outcome: "already_stopped" }
  | { readonly outcome: "refused"; readonly reason: string }
  | { readonly outcome: "error"; readonly error: Error }

export const StopResult = StaticTypeCompanion({
  stopped(): StopResult {
    return { outcome: "stopped" }
  },

  alreadyStopped(): StopResult {
    return { outcome: "already_stopped" }
  },

  refused(reason: string): StopResult {
    return { outcome: "refused", reason }
  },

  error(error: Error): StopResult {
    return { outcome: "error", error }
  },
})

// ============================================================================
// Supervised
// ============================================================================

export interface Supervised {
  health(): Promise<HealthStatus>
  start(): Promise<StartResult>
  stop(): Promise<StopResult>
}
