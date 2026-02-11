/**
 * ConnectorDef — Static descriptor of a connector type.
 *
 * Carries schema, identity, version, scopes, resolvers, and seeder.
 * Pure data — no factory methods, no runtime logic.
 */

import {
  StaticTypeCompanion,
  Inspect,
  type SeederAny,
  type ResolverAny,
} from "@max/core";
import type { Schema } from "@max/core";

// ============================================================================
// ConnectorDef Interface
// ============================================================================

export interface ConnectorDef<TConfig = unknown> {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly schema: Schema;
  readonly seeder: SeederAny;
  readonly resolvers: readonly ResolverAny[];
}

export type ConnectorDefAny = ConnectorDef<unknown>;

// ============================================================================
// ConnectorDef Implementation (internal)
// ============================================================================

class ConnectorDefImpl<TConfig> implements ConnectorDef<TConfig> {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly schema: Schema;
  readonly seeder: SeederAny;
  readonly resolvers: readonly ResolverAny[];

  static {
    Inspect(this, (self) => ({
      format: "ConnectorDef(%s v%s)",
      params: [self.name, self.version],
    }));
  }

  constructor(opts: {
    name: string;
    displayName: string;
    description: string;
    icon: string;
    version: string;
    scopes: readonly string[];
    schema: Schema;
    seeder: SeederAny;
    resolvers: readonly ResolverAny[];
  }) {
    this.name = opts.name;
    this.displayName = opts.displayName;
    this.description = opts.description;
    this.icon = opts.icon;
    this.version = opts.version;
    this.scopes = Object.freeze([...opts.scopes]);
    this.schema = opts.schema;
    this.seeder = opts.seeder;
    this.resolvers = Object.freeze([...opts.resolvers]);
  }
}

// ============================================================================
// ConnectorDef Static Methods (namespace merge)
// ============================================================================

export const ConnectorDef = StaticTypeCompanion({
  /** Create a new ConnectorDef */
  create<TConfig = unknown>(opts: {
    name: string;
    displayName: string;
    description: string;
    icon: string;
    version: string;
    scopes: string[];
    schema: Schema;
    seeder: SeederAny;
    resolvers: ResolverAny[];
  }): ConnectorDef<TConfig> {
    return new ConnectorDefImpl(opts);
  },
});
