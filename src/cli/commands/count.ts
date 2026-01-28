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
import { cleanupStaleStateFiles } from '../../core/pagination-state.js';
import {PaginationAdvanceResult, PaginationSession} from '../../core/pagination-session.js';
import { sourceArg, entityTypeArg, outputOption } from '../parsers.js';
import type { FilterExpr } from '../../types/filter.js';
import type { EntitySchema } from '../../types/connector.js';

const PAGINATION_THRESHOLD = 2000;

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
  output: outputOption,
});

export async function handleCount(opts: {
  source: string;
  type?: string;
  filter?: string;
  output?: 'text' | 'json';
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  // Cleanup stale state files opportunistically
  cleanupStaleStateFiles(config.getMaxDir());

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

  const format = opts.output ?? 'text';
  const output: { count: number; state?: string } = { count };
  let result: PaginationAdvanceResult | null
  if (count > PAGINATION_THRESHOLD) {
    // Use PaginationSession to create state file for large result sets
    result = PaginationSession.createIfNeeded(
      config.getMaxDir(),
      { source: opts.source, type: opts.type, filter: opts.filter },
      count,
      0  // offset starts at 0
    );
    if (result?.stateRef) {
      output.state = result.stateRef;
    }
  }

  if (format === 'json') {
    console.log(JSON.stringify(output));
  } else {
    // Text output
    console.log(count);
    if (result?.stateRef) {
      console.error(`Hint: Use --state=${result.stateRef} for paginated search`);
    }
  }
}
