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
  type ResolverAny, Id,
} from "@max/core";
import type { Schema } from "@max/core";
import type { OnboardingFlow } from "./onboarding.js";

// ============================================================================
// ConnectorDef Interface
// ============================================================================

export type ConnectorName = Id<'connector-name'>

export interface ConnectorDef<TConfig = unknown> {
  readonly name: ConnectorName;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly schema: Schema;
  readonly onboarding?: OnboardingFlow<TConfig>;
  readonly seeder: SeederAny;
  readonly resolvers: readonly ResolverAny[];
}

export type ConnectorDefAny = ConnectorDef<unknown>;

// ============================================================================
// ConnectorDef Implementation (internal)
// ============================================================================

class ConnectorDefImpl<TConfig> implements ConnectorDef<TConfig> {
  readonly name: ConnectorName;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly schema: Schema;
  readonly onboarding?: OnboardingFlow<TConfig>;
  readonly seeder: SeederAny;
  readonly resolvers: readonly ResolverAny[];

  static {
    Inspect(this, (self) => ({
      format: "ConnectorDef(%s v%s)",
      params: [self.name, self.version],
    }));
  }

  constructor(opts: {
    name: ConnectorName;
    displayName: string;
    description: string;
    icon: string;
    version: string;
    scopes: readonly string[];
    schema: Schema;
    onboarding?: OnboardingFlow<TConfig>;
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
    this.onboarding = opts.onboarding;
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
    name: ConnectorName;
    displayName: string;
    description: string;
    icon: string;
    version: string;
    scopes: string[];
    schema: Schema;
    onboarding?: OnboardingFlow<TConfig>;
    seeder: SeederAny;
    resolvers: ResolverAny[];
  }): ConnectorDef<TConfig> {
    return new ConnectorDefImpl(opts);
  },
});
