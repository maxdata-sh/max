/**
 * ExecutionLocal boundary — domain-owned errors for @max/execution-local.
 */

import {MaxError} from "@max/core";

// ============================================================================
// Boundary
// ============================================================================

export const ExecutionLocal = MaxError.boundary("execution-local");
