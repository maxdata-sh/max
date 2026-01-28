import { object } from '@optique/core/constructs';
import { optional, withDefault } from '@optique/core/modifiers';
import { argument, option, constant } from '@optique/core/primitives';
import { integer, string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { BasicFilterParser } from '../../core/filter/basic-parser.js';
import { renderEntities, type OutputFormat } from '../output.js';
import { sourceArg, entityTypeArg, outputOption, fieldsOption } from '../parsers.js';
import type { FilterExpr } from '../../types/filter.js';
import type { EntitySchema } from '../../types/connector.js';

/**
 * Extract filterable field names from a connector schema.
 */
function getFilterableFieldsFromSchema(schema: EntitySchema): string[] {
  const fields = new Set<string>();
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.filterable) {
        fields.add(field.name);
      }
    }
  }
  return Array.from(fields);
}

export const searchCommand = object({
  cmd: constant('search' as const),
  source: argument(sourceArg, { description: message`Source to search` }),
  type: optional(option('-t', '--type', entityTypeArg, { description: message`Filter by entity type` })),
  filter: optional(option('-f', '--filter', string(), { description: message`Filter expression (e.g., "name=foo AND state=open")` })),
  limit: withDefault(option('--limit', integer({ min: 1 }), { description: message`Maximum results` }), 50),
  offset: withDefault(option('--offset', integer({ min: 0 }), { description: message`Skip first n results` }), 0),
  output: outputOption,
  fields: fieldsOption,
});

export async function handleSearch(opts: {
  source: string;
  type?: string;
  filter?: string;
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

  // Get filterable fields from connector schema
  const allowedColumns = getFilterableFieldsFromSchema(connector.schema);

  // Parse filter expression if provided
  let filterExpr: FilterExpr | undefined;
  if (opts.filter) {
    try {
      const parser = new BasicFilterParser();
      filterExpr = parser.parse(opts.filter, allowedColumns);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      printError(message`Invalid filter expression: ${errorMessage}`, { exitCode: 1 });
    }
  }

  const store = new EntityStore(config);
  await store.initialize();

  const result = await store.queryWithFilter({
    source: opts.source,
    type: opts.type,
    filterExpr,
    allowedColumns,
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
