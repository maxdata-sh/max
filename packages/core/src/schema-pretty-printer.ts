/**
 * SchemaPrettyPrinter — Format a Schema for display.
 */

import { StaticTypeCompanion } from "./companion.js";
import type { EntityDefAny } from "./entity-def.js";
import type { FieldDef } from "./field.js";
import type { Schema, EntityRelationship } from "./schema.js";

function fieldSummary(entity: EntityDefAny): string {
  const parts: string[] = [];
  for (const [name, field] of Object.entries(entity.fields)) {
    const f = field as FieldDef;
    if (f.kind === "scalar") {
      parts.push(name);
    } else if (f.kind === "ref") {
      parts.push(`${name} → ${f.target.name}`);
    } else if (f.kind === "collection") {
      parts.push(`${name} → ${f.target.name}[]`);
    }
  }
  return parts.join(", ");
}

function formatRelationship(r: EntityRelationship): string {
  const card = r.cardinality === "one" ? "one" : "many";
  return `  ${r.from}.${r.field} → ${r.to} (${card})`;
}

export const SchemaPrettyPrinter = StaticTypeCompanion({
  /** Render a schema as human-readable text */
  text(schema: Schema): string {
    const lines: string[] = [];
    lines.push(`${schema.namespace} (${schema.entities.length} entities, ${schema.roots.length} root${schema.roots.length !== 1 ? "s" : ""})`);
    lines.push("");

    lines.push("Entities:");
    const maxNameLen = Math.max(...schema.entities.map((e) => e.name.length));
    for (const entity of schema.entities) {
      const padded = entity.name.padEnd(maxNameLen);
      lines.push(`  ${padded}  (${fieldSummary(entity)})`);
    }
    lines.push("");

    lines.push("Roots:");
    for (const root of schema.roots) {
      lines.push(`  ${root.name}`);
    }

    const rels = schema.relationships;
    if (rels.length > 0) {
      lines.push("");
      lines.push("Relationships:");
      for (const r of rels) {
        lines.push(formatRelationship(r));
      }
    }

    return lines.join("\n");
  },

  /** Render a schema as formatted JSON */
  json(schema: Schema): string {
    const result = {
      namespace: schema.namespace,
      entities: schema.entities.map((e) => ({
        name: e.name,
        fields: Object.entries(e.fields).map(([name, field]) => {
          const f = field as FieldDef;
          if (f.kind === "scalar") {
            return { name, kind: "scalar" as const, type: f.type };
          }
          return { name, kind: f.kind, target: f.target.name };
        }),
      })),
      roots: schema.roots.map((r) => r.name),
      relationships: schema.relationships.map((r) => ({
        from: r.from,
        field: r.field,
        to: r.to,
        cardinality: r.cardinality,
      })),
    };
    return JSON.stringify(result, null, 2);
  },
});
