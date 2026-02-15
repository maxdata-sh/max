/**
 * SchemaPrettyPrinter — Format a Schema for display.
 */

import { StaticTypeCompanion } from './companion.js'
import type { EntityDefAny } from './entity-def.js'
import type { FieldDef } from './field.js'
import type { Schema, EntityRelationship } from './schema.js'

/** Note - this framing is a bit misleading - it's less about pretty printing and more about converting a domain object into a standard form  */
export const SchemaPrettyPrinter = StaticTypeCompanion({
  /** Convert a schema to a slimmed down json representation */
  jsonObject(schema: Schema) {
    return {
      namespace: schema.namespace,
      entities: schema.entities.map((e) => ({
        name: e.name,
        fields: Object.entries(e.fields).map(([name, field]) => {
          const f = field as FieldDef
          if (f.kind === 'scalar') {
            return { name, kind: 'scalar' as const, type: f.type }
          }
          return { name, kind: f.kind, target: f.target.name }
        }),
      })),
      roots: schema.roots.map((r) => r.name),
      relationships: schema.relationships.map((r) => ({
        from: r.from,
        field: r.field,
        to: r.to,
        cardinality: r.cardinality,
      })),
    }
  },
})
