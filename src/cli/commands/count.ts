import { object } from '@optique/core/constructs';
import { optional } from '@optique/core/modifiers';
import { argument, option, constant } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { BasicFilterParser } from '../../core/filter/basic-parser.js';
import { sourceArg, entityTypeArg } from '../parsers.js';
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

export const countCommand = object({
  cmd: constant('count' as const),
  source: argument(sourceArg, { description: message`Source to count` }),
  type: optional(option('-t', '--type', entityTypeArg, { description: message`Filter by entity type` })),
  filter: optional(option('-f', '--filter', string(), { description: message`Filter expression` })),
});

export async function handleCount(opts: {
  source: string;
  type?: string;
  filter?: string;
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const registry = new ConnectorRegistry(config);
  const connector = await registry.get(opts.source);
  if (!connector) {
    printError(message`Unknown source: ${opts.source}`, { exitCode: 1 });
  }

  const allowedColumns = getFilterableFieldsFromSchema(connector.schema);

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

  const count = await store.count({
    source: opts.source,
    type: opts.type,
    filterExpr,
    allowedColumns,
  });

  // Output just the number - easy to capture
  console.log(count);
}
