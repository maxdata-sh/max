import { object } from '@optique/core/constructs';
import { constant } from '@optique/core/primitives';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import type { EntitySchema } from '../../types/connector.js';

export const llmBootstrapCommand = object({
  cmd: constant('llm-bootstrap' as const),
});

interface ConnectorInfo {
  type: string;
  schema: EntitySchema;
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  gdrive: 'Google Drive',
  linear: 'Linear',
  hubspot: 'HubSpot',
};

function getDisplayName(type: string): string {
  return SOURCE_DISPLAY_NAMES[type] || type;
}

function generateSourcesList(connectors: ConnectorInfo[]): string {
  return connectors.map(c => getDisplayName(c.type)).join(', ');
}

function generateSourcesSummary(connectors: ConnectorInfo[]): string {
  return connectors.map(c => {
    const entityTypes = c.schema.entities.map(e => `\`${e.type}\``).join(', ');
    return `- **${getDisplayName(c.type)}** (\`${c.type}\`): ${entityTypes}`;
  }).join('\n');
}

function generateSchemaCommands(connectors: ConnectorInfo[]): string {
  return connectors.map(c => `max schema ${c.type}`).join('\n');
}

function pluralize(word: string): string {
  if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch') || word.endsWith('sh')) return word + 'es';
  return word + 's';
}

function pickExampleField(fields: { name: string; filterable: boolean; type: string }[]): { name: string } | undefined {
  // Prefer meaningful fields over 'id'
  const dominated = ['name', 'email', 'state', 'stage', 'owner', 'assignee', 'title', 'domain', 'industry'];
  const filterable = fields.filter(f => f.filterable && f.type === 'string');

  for (const preferred of dominated) {
    const found = filterable.find(f => f.name === preferred);
    if (found) return found;
  }

  // Fall back to first non-id filterable string field
  return filterable.find(f => f.name !== 'id') || filterable[0];
}

function generateSearchExamples(connectors: ConnectorInfo[]): string {
  const examples: string[] = [];

  for (const connector of connectors) {
    const { type, schema } = connector;
    const displayName = getDisplayName(type);

    for (const entity of schema.entities.slice(0, 2)) {
      const field = pickExampleField(entity.fields);
      if (field) {
        examples.push(`# Find ${displayName} ${pluralize(entity.type)} by ${field.name}`);
        examples.push(`max search ${type} --type=${entity.type} --filter ${field.name}="value"`);
        examples.push('');
      }
    }
  }

  examples.push('# Wildcard patterns - use * or ? for glob matching');
  if (connectors.length > 0) {
    const c = connectors[0];
    const entity = c.schema.entities[0];
    const field = pickExampleField(entity.fields);
    if (field) {
      examples.push(`max search ${c.type} --type=${entity.type} --filter "${field.name}=*keyword*"`);
    }
  }
  examples.push('');
  examples.push('# Get JSON for parsing');
  if (connectors.length > 0) {
    const c = connectors[0];
    examples.push(`max search ${c.type} --limit=5 -o json`);
  }

  return examples.join('\n');
}

function generateGetExamples(connectors: ConnectorInfo[]): string {
  return connectors.slice(0, 2).map(c =>
    `max get ${c.type} <id> -o json`
  ).join('\n');
}

function generateEntityTypesList(connectors: ConnectorInfo[]): string {
  return connectors.map(c => {
    const types = c.schema.entities.map(e => `\`${e.type}\``).join(', ');
    return `   - ${getDisplayName(c.type)}: ${types}`;
  }).join('\n');
}

async function loadConnectors(): Promise<ConnectorInfo[]> {
  const config = ConfigManager.find();
  if (!config) {
    return [];
  }

  const registry = new ConnectorRegistry(config);
  const types = registry.list();
  const connectors: ConnectorInfo[] = [];

  for (const type of types) {
    const connector = await registry.get(type);
    if (connector) {
      connectors.push({ type, schema: connector.schema });
    }
  }

  return connectors;
}

function expandTemplate(template: string, connectors: ConnectorInfo[]): string {
  const replacements: Record<string, string> = {
    '{{SOURCES_LIST}}': generateSourcesList(connectors),
    '{{SOURCES_SUMMARY}}': generateSourcesSummary(connectors),
    '{{SCHEMA_COMMANDS}}': generateSchemaCommands(connectors),
    '{{SEARCH_EXAMPLES}}': generateSearchExamples(connectors),
    '{{GET_EXAMPLES}}': generateGetExamples(connectors),
    '{{ENTITY_TYPES_LIST}}': generateEntityTypesList(connectors),
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(placeholder, value);
  }

  return result;
}

export async function handleLlmBootstrap() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const agentMdPath = path.resolve(__dirname, '../../../AGENT.USER.md');

  const template = fs.readFileSync(agentMdPath, 'utf-8');
  const connectors = await loadConnectors();
  const content = expandTemplate(template, connectors);

  console.log(content);
}
