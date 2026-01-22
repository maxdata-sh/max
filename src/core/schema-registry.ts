/**
 * Schema registry - aggregates schemas from all connectors.
 * Used for CLI completions and validation.
 *
 * Schemas are lightweight data - no heavy connector dependencies.
 */

import { gdriveSchema } from '../connectors/gdrive/schema.js';
import { linearSchema } from '../connectors/linear/schema.js';
import type { EntitySchema, FieldDefinition } from '../types/connector.js';

const schemas: EntitySchema[] = [gdriveSchema, linearSchema];

/**
 * Get all registered sources
 */
export function getSources(): string[] {
  return schemas.map(s => s.source);
}

/**
 * Get schema for a specific source
 */
export function getSchema(source: string): EntitySchema | undefined {
  return schemas.find(s => s.source === source);
}

/**
 * Get all entity types across all sources
 */
export function getAllEntityTypes(): Array<{ source: string; type: string }> {
  const types: Array<{ source: string; type: string }> = [];
  for (const schema of schemas) {
    for (const entity of schema.entities) {
      types.push({ source: schema.source, type: entity.type });
    }
  }
  return types;
}

/**
 * Get all filterable fields across all sources
 */
export function getAllFilterableFields(): Array<{ source: string; field: FieldDefinition }> {
  const fields: Array<{ source: string; field: FieldDefinition }> = [];
  for (const schema of schemas) {
    for (const entity of schema.entities) {
      for (const field of entity.fields) {
        if (field.filterable) {
          // Avoid duplicates within same source
          const exists = fields.some(f => f.source === schema.source && f.field.name === field.name);
          if (!exists) {
            fields.push({ source: schema.source, field });
          }
        }
      }
    }
  }
  return fields;
}

/**
 * Get filterable fields for a specific source
 */
export function getFilterableFields(source: string): FieldDefinition[] {
  const schema = getSchema(source);
  if (!schema) return [];

  const fields: FieldDefinition[] = [];
  const seen = new Set<string>();

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.filterable && !seen.has(field.name)) {
        fields.push(field);
        seen.add(field.name);
      }
    }
  }
  return fields;
}

/**
 * Validate that a field is filterable for a given source
 */
export function isFilterableField(source: string, fieldName: string): boolean {
  const fields = getFilterableFields(source);
  return fields.some(f => f.name === fieldName);
}
