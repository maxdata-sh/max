/**
 * ExecutionSqlite boundary — domain-owned errors for @max/execution-sqlite.
 */

import {MaxError} from "@max/core";

// ============================================================================
// Boundary
// ============================================================================

export const ExecutionSqlite = MaxError.boundary("execution-sqlite");
