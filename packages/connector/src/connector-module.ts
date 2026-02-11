/**
 * ConnectorModule — The bundled export from a connector package.
 *
 * Pairs a ConnectorDef with an initialise function.
 * This is what the platform imports and what the registry resolves to.
 */

import { StaticTypeCompanion } from "@max/core";
import type { ConnectorDef } from "./connector-def.js";
import type { Installation } from "./installation.js";
import type { CredentialProvider } from "./credential-provider.js";

// ============================================================================
// ConnectorModule Interface
// ============================================================================

export interface ConnectorModule<TConfig = unknown> {
  readonly def: ConnectorDef<TConfig>;
  initialise(config: TConfig, credentials: CredentialProvider): Installation;
}

export type ConnectorModuleAny = ConnectorModule<unknown>;

// ============================================================================
// ConnectorModule Static Methods
// ============================================================================

export const ConnectorModule = StaticTypeCompanion({
  create<TConfig>(opts: {
    def: ConnectorDef<TConfig>;
    initialise: (config: TConfig, credentials: CredentialProvider) => Installation;
  }): ConnectorModule<TConfig> {
    return {
      def: opts.def,
      initialise: opts.initialise,
    };
  },
});
