/**
 * Ref - A reference to an entity, scoped to a particular level.
 */

import type { EntityDefAny } from "./entity-def.js";
import type { Scope, LocalScope, SystemScope } from "./scope.js";
import { type RefKey, RefKey as RefKeyUtil, type EntityType, type EntityId } from "./ref-key.js";

// ============================================================================
// ScopeUpgradeable Marker Interface
// ============================================================================

/**
 * Marker interface for types that can upgrade their scope.
 *
 * Each implementing type defines its own upgradeScope with specific return type.
 */
export interface ScopeUpgradeable {
  readonly scope: Scope;
  upgradeScope(newScope: Scope): ScopeUpgradeable;
}

// ============================================================================
// Ref Interface
// ============================================================================

/**
 * Ref<E, S> - A reference to an entity of type E at scope S.
 *
 * S defaults to Scope (the union), meaning "any scope".
 * Most code can ignore S and just use Ref<E>.
 * Boundary-crossing code specifies LocalScope or SystemScope explicitly.
 */
export interface Ref<E extends EntityDefAny = EntityDefAny, S extends Scope = Scope>
  extends ScopeUpgradeable {
  /** The entity definition (runtime) */
  readonly entityDef: E;

  /** The entity type name */
  readonly entityType: EntityType;

  /** The entity ID */
  readonly id: EntityId;

  /** The scope this ref exists in */
  readonly scope: S;

  /** Get a unique key that identifies this ref */
  toKey(): RefKey;

  /** Check if this ref points to the same entity as another */
  equals(other: Ref<EntityDefAny, Scope>): boolean;

  /** Upgrade this ref to a new scope */
  upgradeScope<NewS extends Scope>(newScope: NewS): Ref<E, NewS>;
}

/** Any Ref - for functions that accept any reference */
export type RefAny = Ref<EntityDefAny, Scope>;

/** Convenience aliases */
export type LocalRef<E extends EntityDefAny = EntityDefAny> = Ref<E, LocalScope>;
export type SystemRef<E extends EntityDefAny = EntityDefAny> = Ref<E, SystemScope>;

// ============================================================================
// Ref Implementation
// ============================================================================

/**
 * Ref class implementation.
 */
export class RefImpl<E extends EntityDefAny, S extends Scope = Scope> implements Ref<E, S> {
  readonly entityType: EntityType;

  constructor(
    readonly entityDef: E,
    readonly id: EntityId,
    readonly scope: S
  ) {
    this.entityType = entityDef.name as EntityType;
  }

  toKey(): RefKey {
    return RefKeyUtil.from(this.entityType, this.id, this.scope);
  }

  equals(other: Ref<EntityDefAny, Scope>): boolean {
    // Two refs are equal if they point to the same entity type and ID
    // Scope doesn't affect equality - it's the same entity at different scopes
    return this.entityType === other.entityType && this.id === other.id;
  }

  upgradeScope<NewS extends Scope>(newScope: NewS): Ref<E, NewS> {
    return new RefImpl(this.entityDef, this.id, newScope);
  }

  /** Custom inspect for Node.js console */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    if (this.scope.kind === "local") {
      return `Ref<${this.entityType}>(${this.id})`;
    } else {
      return `Ref<${this.entityType}>(${this.id}, inst:${this.scope.installationId})`;
    }
  }

  toString(): string {
    return this.toKey() as string;
  }

  // ============================================================================
  // Static Factories
  // ============================================================================

  /** Create a local-scoped ref */
  static local<E extends EntityDefAny>(def: E, id: EntityId): Ref<E, LocalScope> {
    return new RefImpl(def, id, { kind: "local" });
  }

  /** Create a system-scoped ref */
  static system<E extends EntityDefAny>(
    def: E,
    id: EntityId,
    scope: SystemScope
  ): Ref<E, SystemScope> {
    return new RefImpl(def, id, scope);
  }

  /** Create a ref with explicit scope */
  static create<E extends EntityDefAny, S extends Scope>(
    def: E,
    id: EntityId,
    scope: S
  ): Ref<E, S> {
    return new RefImpl(def, id, scope);
  }
}

// ============================================================================
// Convenience Re-export
// ============================================================================

/** Alias for backwards compatibility and convenience */
export const RefOf = RefImpl;
