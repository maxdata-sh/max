import { object } from '@optique/core/constructs';
import { optional, withDefault, multiple } from '@optique/core/modifiers';
import { argument, option, constant } from '@optique/core/primitives';
import { integer } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { isFilterableField } from '../../core/schema-registry.js';
import { renderEntities, type OutputFormat } from '../output.js';
import { sourceArg, entityTypeArg, filterArg, outputOption, fieldsOption } from '../parsers.js';
import type { Filter } from '../../types/entity.js';

export const searchCommand = object({
  cmd: constant('search' as const),
  source: argument(sourceArg, { description: message`Source to search` }),
  type: optional(option('-t', '--type', entityTypeArg, { description: message`Filter by entity type` })),
  filters: multiple(option('-f', '--filter', filterArg, { description: message`Filter by field=value` })),
  limit: withDefault(option('--limit', integer({ min: 1 }), { description: message`Maximum results` }), 50),
  offset: withDefault(option('--offset', integer({ min: 0 }), { description: message`Skip first n results` }), 0),
  output: outputOption,
  fields: fieldsOption,
});

export async function handleSearch(opts: {
  source: string;
  type?: string;
  filters: readonly { field: string; value: string }[];
  limit: number;
  offset: number;
  output?: 'text' | 'json';
  fields: readonly (readonly string[])[];
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  // Get the connector for formatting
  const registry = new ConnectorRegistry(config);
  const connector = await registry.get(opts.source);
  if (!connector) {
    printError(message`Unknown source: ${opts.source}`, { exitCode: 1 });
  }

  // Validate filters against schema
  for (const { field } of opts.filters) {
    if (!isFilterableField(opts.source, field)) {
      printError(message`Field "${field}" is not filterable for source "${opts.source}". Run "max schema ${opts.source}" to see available fields.`, { exitCode: 1 });
    }
  }

  const store = new EntityStore(config);
  await store.initialize();

  // Convert filters to query format
  // Auto-detect glob patterns: if value contains * or ?, use 'like' operator
  const filters: Filter[] = opts.filters.map(({ field, value }) => {
    const hasWildcard = value.includes('*') || value.includes('?');
    return {
      field,
      op: hasWildcard ? 'like' as const : '=' as const,
      value,
    };
  });

  const result = await store.query({
    source: opts.source,
    type: opts.type,
    filters,
    limit: opts.limit,
    offset: opts.offset,
  });

  const permissionsEngine = new PermissionsEngine();
  await permissionsEngine.loadRulesFromConfig(config);

  const filteredEntities = permissionsEngine.filter(result.entities, {});
  const filteredCount = result.entities.length - filteredEntities.length;
  const format = (opts.output ?? 'text') as OutputFormat;
  const adjustedTotal = result.total - filteredCount;

  const pagination = opts.limit ? {
    offset: opts.offset ?? 0,
    limit: opts.limit,
    total: adjustedTotal,
  } : undefined;

  console.log(renderEntities(filteredEntities, format, connector.formatEntity.bind(connector), {
    pagination,
    fields: opts.fields.flat(),
  }));

  if (filteredCount > 0 && format === 'text') {
    print(message`(${filteredCount.toString()} result${filteredCount !== 1 ? 's' : ''} filtered by rules)`);
  }
}
