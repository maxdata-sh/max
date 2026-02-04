/**
 * Domain identifies the installation/tenant context.
 *
 * Local domain: single installation, installationId optional
 * Global domain: multi-tenant, installationId required
 */

export interface LocalDomain {
  kind: "local";
}

export interface GlobalDomain {
  kind: "global";
  installationId: string;
}

export type Domain = LocalDomain | GlobalDomain;

export const Domain = {
  local(): LocalDomain {
    return { kind: "local" };
  },
  global(installationId: string): GlobalDomain {
    return { kind: "global", installationId };
  },
} as const;
