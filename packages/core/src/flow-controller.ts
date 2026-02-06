/**
 * FlowController - Interface for rate-limiting operations.
 *
 * The executor checks the FlowController before running loaders.
 * If rate-limited, the task is requeued with a delay.
 *
 * Interface defined now; v1 uses NoOpFlowController.
 */

import type {Id} from "./brand.js";

// ============================================================================
// Types
// ============================================================================

/** Identifies a kind of operation for rate limiting (e.g., "acme:api-call") */
export type OperationKind = Id<"operation-kind">;

/** Token returned by acquire(), released when the operation completes */
export interface FlowToken {
  readonly operationKind: OperationKind;
}

// ============================================================================
// FlowController Interface
// ============================================================================

export interface FlowController {
  /** Request permission to perform an operation. Returns when allowed. */
  acquire(operation: OperationKind, count?: number): Promise<FlowToken>;

  /** Release a token (for operations that hold a slot) */
  release(token: FlowToken): void;
}

// ============================================================================
// NoOpFlowController
// ============================================================================

/** FlowController that permits all operations immediately */
export class NoOpFlowController implements FlowController {
  async acquire(operation: OperationKind): Promise<FlowToken> {
    return { operationKind: operation };
  }

  release(): void {}
}
