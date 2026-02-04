/**
 * Rich reference type that carries entity type, id, and reference kind.
 */

import type { Domain } from "./domain.js";
import type { EntityDefAny } from "./entity-def.js";

/**
 * ReferenceKind distinguishes how we're pointing to an entity.
 *
 * - direct: Entity exists in Max's DB, we have the atomId
 * - indirect: Entity in upstream, identified by upstreamId
 * - id-only: Minimal reference, just atomId (no type info at runtime)
 */
export type ReferenceKind = "direct" | "indirect" | "id-only";

/**
 * Ref - a rich reference object.
 *
 * Carries all information needed to identify an entity:
 * - Entity type (runtime)
 * - ID (upstream or atom)
 * - Reference kind
 * - Domain (optional)
 *
 * Usage:
 *   const ref = SlackChannel.ref("C123");
 *   engine.load(ref, Fields.ALL);  // ref is self-sufficient
 *
 *   ref.entityDef;  // SlackChannel
 *   ref.id;         // "C123"
 *   ref.kind;       // "indirect" (not yet in DB)
 */
export interface Ref<E extends EntityDefAny = EntityDefAny> {
  /** The entity definition (runtime) */
  readonly entityDef: E;

  /** The entity type name (convenience) */
  readonly entityType: string;

  /** The upstream ID or atom ID depending on kind */
  readonly id: string;

  /** What kind of reference this is */
  readonly kind: ReferenceKind;

  /** Atom ID if this is a direct reference */
  readonly atomId?: string;

  /** Domain context */
  readonly domain?: Domain;

  /** Serialize to string form */
  toString(): string;

  /** Check if this ref points to the same entity as another */
  equals(other: RefAny): boolean;
}

/** Any Ref - for functions that accept any reference */
export type RefAny = Ref<EntityDefAny>;

/** Helper class for creating Refs */
export class RefOf<E extends EntityDefAny> implements Ref<E> {
  constructor(
    readonly entityDef: E,
    readonly id: string,
    readonly kind: ReferenceKind = "indirect",
    readonly atomId?: string,
    readonly domain?: Domain
  ) {}

  get entityType(): string {
    return this.entityDef.name;
  }

  toString(): string {
    if (this.kind === "direct" || this.kind === "id-only") {
      return `atm:${this.atomId}`;
    }
    if (this.domain?.kind === "global") {
      return `egl:${this.domain.installationId}:${this.entityType}:${this.id}`;
    }
    return `elo:${this.entityType}:${this.id}`;
  }

  equals(other: RefAny): boolean {
    if (this.atomId && other.atomId) {
      return this.atomId === other.atomId;
    }
    return this.entityType === other.entityType && this.id === other.id;
  }

  /** Upgrade to direct ref when we have an atomId */
  withAtomId(atomId: string): RefOf<E> {
    return new RefOf(this.entityDef, this.id, "direct", atomId, this.domain);
  }

  /** Create an indirect ref */
  static indirect<E extends EntityDefAny>(def: E, id: string, domain?: Domain): Ref<E> {
    return new RefOf(def, id, "indirect", undefined, domain);
  }

  /** Create a direct ref */
  static direct<E extends EntityDefAny>(def: E, id: string, atomId: string, domain?: Domain): Ref<E> {
    return new RefOf(def, id, "direct", atomId, domain);
  }
}
