/**
 * Domain identifies the installation/tenant context.
 *
 * Local domain: single installation, installationId optional
 * Global domain: multi-tenant, installationId required
 */
import {StaticTypeCompanion} from "./companion.js";

export interface LocalDomain {
  kind: "local";
}

export interface GlobalDomain {
  kind: "global";
  installationId: string;
}

export type Domain = LocalDomain | GlobalDomain;

export const Domain = StaticTypeCompanion({
  local(): LocalDomain {
    return { kind: "local" };
  },
  global(installationId: string): GlobalDomain {
    return { kind: "global", installationId };
  },
})
