import type { StoredEntity, EntitySchema, PermissionsSummary, Rule } from '../types/index.js';

export type OutputFormat = 'text' | 'json';

export function renderEntities(entities: StoredEntity[], format: OutputFormat, total?: number): string {
  if (format === 'json') {
    return JSON.stringify(entities, null, 2);
  }

  if (entities.length === 0) {
    return 'No results found.';
  }

  const lines: string[] = [];
  const displayTotal = total ?? entities.length;
  lines.push(`${displayTotal} result${displayTotal !== 1 ? 's' : ''}:\n`);

  for (const entity of entities) {
    const props = entity.properties;
    lines.push(`${props.name || entity.id}`);
    if (props.path) {
      lines.push(`   Path: ${props.path}`);
    }
    if (props.owner) {
      lines.push(`   Owner: ${props.owner}`);
    }
    if (props.modifiedAt) {
      const date = new Date(props.modifiedAt as string);
      lines.push(`   Modified: ${date.toISOString().split('T')[0]}`);
    }
    if (props.mimeType) {
      lines.push(`   Type: ${formatMimeType(props.mimeType as string)}`);
    }
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

function formatMimeType(mimeType: string): string {
  const mappings: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'application/pdf': 'PDF',
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'application/json': 'JSON',
  };
  return mappings[mimeType] || mimeType;
}
