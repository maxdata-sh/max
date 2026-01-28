import type { StoredEntity, EntitySchema, PermissionsSummary, Rule } from '../types/index.js';

export type OutputFormat = 'text' | 'json' | 'ndjson';

export interface PaginationInfo {
  offset: number;
  limit: number;
  total: number;
}

export interface RenderOptions {
  pagination?: PaginationInfo;
  fields?: readonly string[];
}

/**
 * Select specific fields from an entity.
 * Always includes id, source, and type. Additional fields come from properties.
 */
function selectFields(entity: StoredEntity, fields: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: entity.id,
    source: entity.source,
    type: entity.type,
  };

  for (const field of fields) {
    if (field in entity.properties) {
      result[field] = entity.properties[field];
    }
  }

  return result;
}

/**
 * Flatten an entity to a single-level object.
 * Combines id, source, type with all properties at top level.
 */
export function flattenEntity(entity: StoredEntity): Record<string, unknown> {
  return {
    id: entity.id,
    source: entity.source,
    type: entity.type,
    ...entity.properties,
  };
}

/**
 * Pick specific fields from a flattened entity.
 * Always includes id, source, and type.
 */
export function pickFields(
  flattened: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: flattened.id,
    source: flattened.source,
    type: flattened.type,
  };

  for (const field of fields) {
    if (field in flattened && field !== 'id' && field !== 'source' && field !== 'type') {
      result[field] = flattened[field];
    }
  }

  return result;
}

/**
 * Render entities using a provided formatter function.
 * The formatter is typically provided by the connector.
 *
 * Note: ndjson format is handled separately in the search command,
 * not through this function. This handles text and json only.
 */
export function renderEntities(
  entities: StoredEntity[],
  format: 'text' | 'json',
  formatEntity: (entity: StoredEntity) => string,
  options?: RenderOptions
): string {
  const { pagination, fields } = options ?? {};

  if (format === 'json') {
    const data = fields && fields.length > 0
      ? entities.map(e => selectFields(e, fields))
      : entities;

    const response = {
      pagination: pagination
        ? {
            offset: pagination.offset,
            limit: pagination.limit,
            total: pagination.total,
            hasMore: pagination.offset + entities.length < pagination.total,
          }
        : null,
      data,
    };
    return JSON.stringify(response, null, 2);
  }

  if (entities.length === 0) {
    return 'No results found.';
  }

  const lines: string[] = [];
  if (pagination) {
    const start = pagination.offset + 1;
    const end = pagination.offset + entities.length;
    lines.push(`Results ${start}-${end} of ${pagination.total}\n`);
  } else {
    lines.push(`${entities.length} result${entities.length !== 1 ? 's' : ''}:\n`);
  }

  for (const entity of entities) {
    lines.push(formatEntity(entity));
    lines.push('');
  }

  return lines.join('\n');
}

export function renderSchema(schema: EntitySchema, format: OutputFormat): string {
  if (format === 'json') {
    return JSON.stringify(schema, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Source: ${schema.source}\n`);

  for (const entity of schema.entities) {
    lines.push(`Entity: ${entity.type}`);
    lines.push('  Fields:');
    for (const field of entity.fields) {
      const filterable = field.filterable ? ' (filterable)' : '';
      lines.push(`    - ${field.name}: ${field.type}${filterable}`);
    }
    if (entity.relationships.length > 0) {
      lines.push('  Relationships:');
      for (const rel of entity.relationships) {
        const target = Array.isArray(rel.targetType) ? rel.targetType.join(' | ') : rel.targetType;
        lines.push(`    - ${rel.name}: ${target} (${rel.cardinality})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderPermissions(summary: PermissionsSummary, format: OutputFormat): string {
  if (format === 'json') {
    return JSON.stringify(summary, null, 2);
  }

  const lines: string[] = [];

  lines.push(`Source permissions (from ${summary.source.type}):`);
  for (const perm of summary.source.permissions) {
    const who = perm.email || perm.domain || perm.type;
    lines.push(`  - ${who}: ${perm.role}`);
  }

  lines.push('');
  lines.push('Normalized permissions:');
  for (const perm of summary.normalized) {
    const who = perm.principal.identifier || perm.principal.type;
    lines.push(`  - ${who}: ${perm.access}`);
  }

  if (summary.appliedRules.length > 0) {
    lines.push('');
    lines.push('Applied rules:');
    for (const rule of summary.appliedRules) {
      lines.push(`  - ${rule.rule}: ${rule.effect}`);
    }
  } else {
    lines.push('');
    lines.push('Applied rules: none');
  }

  lines.push('');
  lines.push(`Effective access: ${summary.effectiveAccess ? 'allowed' : 'denied'}`);

  return lines.join('\n');
}

export function renderRules(rules: Rule[], format: OutputFormat): string {
  if (format === 'json') {
    return JSON.stringify(rules, null, 2);
  }

  if (rules.length === 0) {
    return 'No rules loaded.';
  }

  const lines: string[] = [];
  lines.push(`${rules.length} rule${rules.length !== 1 ? 's' : ''} loaded:\n`);

  for (const rule of rules) {
    lines.push(`${rule.name}`);
    lines.push(`  Type: ${rule.type}`);
    if (rule.match.path) {
      lines.push(`  Path: ${rule.match.path}`);
    }
    if (rule.match.owner) {
      lines.push(`  Owner: ${rule.match.owner}`);
    }
    if (rule.match.type) {
      lines.push(`  Entity type: ${rule.match.type}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderSuccess(message: string): string {
  return `✓ ${message}`;
}

export function renderError(message: string): string {
  return `Error: ${message}`;
}

export function renderProgress(message: string): string {
  return `→ ${message}`;
}
