/**
 * Schema — Immutable class representing a data model.
 *
 * Entity defs, root entities, relationships, namespace.
 * No runtime behaviour. Passable independently of the connector itself.
 */

import {
  StaticTypeCompanion,
  Inspect,
  Lazy,
  type EntityDefAny,
  type EntityType,
} from "./index.js";
import { ErrRootNotInEntities } from "./errors/errors.js";

// ============================================================================
// EntityRelationship
// ============================================================================

export interface EntityRelationship {
  from: EntityType;
  field: string;
  to: EntityType;
  cardinality: "one" | "many";
}

// ============================================================================
// Schema Interface
// ============================================================================

export interface Schema {
  readonly namespace: string;
  readonly entities: readonly EntityDefAny[];
  readonly roots: readonly EntityDefAny[];

  /** Lookup an entity definition by name */
  getDefinition(name: string | EntityType): EntityDefAny | undefined;

  /** All entity type names in this schema */
  readonly entityTypes: readonly EntityType[];

  /** Relationships derived from ref and collection fields */
  readonly relationships: readonly EntityRelationship[];
}

// ============================================================================
// Schema Implementation (internal)
// ============================================================================

class SchemaImpl implements Schema {
  readonly namespace: string;
  readonly entities: readonly EntityDefAny[];
  readonly roots: readonly EntityDefAny[];

  private lazy = new Lazy({
    entityMap: () => new Map(this.entities.map((e) => [e.name, e])),
    entityTypes: () => Object.freeze(this.entities.map(e => e.name)),
    relationships: () => Object.freeze(deriveRelationships(this.entities))
  }).read

  private _entityTypes: readonly EntityType[] | null = null;
  private _relationships: readonly EntityRelationship[] | null = null;

  static {
    Inspect(this, (self) => ({
      format: "Schema(%s, %d entities)",
      params: [self.namespace, self.entities.length],
    }));
  }

  constructor(namespace: string, entities: readonly EntityDefAny[], roots: readonly EntityDefAny[]) {
    this.namespace = namespace;
    this.entities = Object.freeze([...entities]);
    this.roots = Object.freeze([...roots]);

  }

  getDefinition(name: string | EntityType): EntityDefAny | undefined {
    return this.lazy.entityMap.get(name)
  }

  get entityTypes(): readonly EntityType[] {
    return this.lazy.entityTypes
  }

  get relationships(): readonly EntityRelationship[] {
    return this.lazy.relationships
  }
}

// ============================================================================
// Relationship Derivation
// ============================================================================

function deriveRelationships(entities: readonly EntityDefAny[]): EntityRelationship[] {
  const result: EntityRelationship[] = [];

  for (const entity of entities) {
    for (const [fieldName, fieldDef] of Object.entries(entity.fields)) {
      if (fieldDef.kind === "ref") {
        result.push({
          from: entity.name,
          field: fieldName,
          to: fieldDef.target.name,
          cardinality: "one",
        });
      } else if (fieldDef.kind === "collection") {
        result.push({
          from: entity.name,
          field: fieldName,
          to: fieldDef.target.name,
          cardinality: "many",
        });
      }
    }
  }

  return result;
}

// ============================================================================
// Schema Static Methods (namespace merge)
// ============================================================================

export const Schema = StaticTypeCompanion({
  /** Create a new Schema from entity definitions */
  create(opts: {
    namespace: string;
    entities: EntityDefAny[];
    roots: EntityDefAny[];
  }): Schema {
    // Validate roots are subset of entities
    const entitySet = new Set(opts.entities);
    for (const root of opts.roots) {
      if (!entitySet.has(root)) {
        throw ErrRootNotInEntities.create({ root: root.name });
      }
    }

    return new SchemaImpl(opts.namespace, opts.entities, opts.roots);
  },
});
