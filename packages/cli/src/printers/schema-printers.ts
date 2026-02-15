import { CliValuePrinter } from '../cli-printable.js'
import {
  EntityDefAny,
  type EntityRelationship,
  type FieldDef,
  Schema,
  SchemaPrettyPrinter,
} from '@max/core'

const FieldSummaryPrinter = CliValuePrinter.of<EntityDefAny>((entity, fmt) => {
  const parts: string[] = []
  for (const [name, field] of Object.entries(entity.fields)) {
    const f = field
    if (f.kind === 'scalar') {
      parts.push(name)
    } else if (f.kind === 'ref') {
      parts.push(`${name} → ${f.target.name}`)
    } else if (f.kind === 'collection') {
      parts.push(`${name} → ${f.target.name}[]`)
    }
  }
  return parts.join(', ')
})

const EntityRelationshipPrinter = CliValuePrinter.of<EntityRelationship>((r, fmt) => {
  const card = r.cardinality === 'one' ? 'one' : 'many'
  return `  ${r.from}.${r.field} → ${r.to} (${card})`
})

export const SchemaPrinters = {
  SchemaText: CliValuePrinter.of<Schema>((schema, fmt) => {
    const lines: string[] = []
    lines.push(
      `${fmt.underline('Name:')} ${schema.namespace} (${schema.entities.length} entities, ${schema.roots.length} root${schema.roots.length !== 1 ? 's' : ''})`
    )
    lines.push('')

    lines.push(fmt.underline('Entities:'))
    const maxNameLen = Math.max(...schema.entities.map((e) => e.name.length))
    for (const entity of schema.entities) {
      const padded = entity.name.padEnd(maxNameLen)
      lines.push(`  ${padded}  (${FieldSummaryPrinter.print(entity, fmt)})`)
    }
    lines.push('')

    lines.push(fmt.underline('Roots:'))
    for (const root of schema.roots) {
      lines.push(`  ${root.name}`)
    }

    const rels = schema.relationships
    if (rels.length > 0) {
      lines.push('')
      lines.push(fmt.underline('Relationships:'))
      for (const r of rels) {
        lines.push(EntityRelationshipPrinter.print(r, fmt))
      }
    }

    return lines.join('\n')
  }),
  SchemaJson: CliValuePrinter.of<Schema>((value, fmt) => {
    return JSON.stringify(SchemaPrettyPrinter.jsonObject(value), null, 2)
  }),
  SchemaJsonl: CliValuePrinter.of<Schema>((value, fmt) => {
    return JSON.stringify(SchemaPrettyPrinter.jsonObject(value))
  }),
}
