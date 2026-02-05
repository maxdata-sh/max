/**
 * Scope - The level at which Maxwell operates.
 *
 * Scopes form a hierarchy:
 *   Local < System < (potentially more)
 *
 * Local: Single engine, single installation. No installation context needed.
 * System: Multiple installations. Refs carry installationId.
 */

import type { InstallationId } from "./ref-key.js";

export interface LocalScope {
  readonly kind: "local";
}

export interface SystemScope {
  readonly kind: "system";
  readonly installationId: InstallationId;
}

export type Scope = LocalScope | SystemScope;

export const Scope = {
  local(): LocalScope {
    return { kind: "local" };
  },

  system(installationId: InstallationId): SystemScope {
    return { kind: "system", installationId };
  },

  isLocal(scope: Scope): scope is LocalScope {
    return scope.kind === "local";
  },

  isSystem(scope: Scope): scope is SystemScope {
    return scope.kind === "system";
  },
} as const;
