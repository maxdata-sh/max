import { object } from '@optique/core/constructs';
import { optional, withDefault } from '@optique/core/modifiers';
import { argument, option, constant } from '@optique/core/primitives';
import { integer, string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { BasicFilterParser } from '../../core/filter/basic-parser.js';
import { cleanupStaleStateFiles } from '../../core/pagination-state.js';
import { PaginationSession, createPaginationHandler } from '../../core/pagination-session.js';
import { createPrinter } from '../printer.js';
import { sourceArg, entityTypeArg, outputOptionWithNdjson, fieldsOption } from '../parsers.js';
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
  source: optional(argument(sourceArg, { description: message`Source to search` })),
  type: optional(option('-t', '--type', entityTypeArg, { description: message`Filter by entity type` })),
  filter: optional(option('-f', '--filter', string(), { description: message`Filter expression (e.g., "name=foo AND state=open")` })),
  all: option('--all', { description: message`Return all results (no limit)` }),
  limit: withDefault(option('--limit', integer({ min: 1 }), { description: message`Maximum results` }), 50),
  offset: withDefault(option('--offset', integer({ min: 0 }), { description: message`Skip first n results` }), 0),
  output: outputOptionWithNdjson,
  fields: fieldsOption,
  mergedStream: option('--merged-stream', { description: message`Write all ndjson output to stdout (metadata last)` }),
  init: option('--init', { description: message`Create a virgin state file and exit (outputs path)` }),
  state: optional(option('--state', string(), { description: message`State file for pagination (use with search to continue, or alone to close)` })),
  close: option('--close', { description: message`Delete state file specified by --state and exit` }),
});

export async function handleSearch(opts: {
  source?: string;
  type?: string;
  filter?: string;
  all: boolean;
  limit: number;
  offset: number;
  output?: 'text' | 'json' | 'ndjson';
  fields: readonly (readonly string[])[];
  mergedStream: boolean;
  init: boolean;
  state?: string;
  close: boolean;
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  // Cleanup stale state files opportunistically
  cleanupStaleStateFiles(config.getMaxDir());

  // Handle --init: create virgin state file and exit
  if (opts.init) {
    const stateRef = PaginationSession.createVirgin(config.getMaxDir());
    console.log(stateRef);
    return;
  }

  // Handle --close: delete state file specified by --state and exit
  if (opts.close) {
    if (!opts.state) {
      printError(message`--close requires --state=<path> to specify which state file to delete`, { exitCode: 1 });
    }
    PaginationSession.delete(config.getMaxDir(), opts.state);
    return;
  }

  // Source is required for actual search
  if (!opts.source) {
    printError(message`Source is required for search. Use --init to create a state file.`, { exitCode: 1 });
  }
  const source = opts.source;

  // Get the connector for formatting
  const registry = new ConnectorRegistry(config);
  const connector = await registry.get(source);
  if (!connector) {
    printError(message`Unknown source: ${source}`, { exitCode: 1 });
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

  // Set up pagination handler (handles both new and resumed sessions)
  const queryParams = { source, type: opts.type, filter: opts.filter };
  let paginationHandler: ReturnType<typeof createPaginationHandler>;

  try {
    paginationHandler = createPaginationHandler(
      config.getMaxDir(),
      opts.state,
      queryParams,
      opts.offset,
    );
  } catch (err) {
    printError(message`${err instanceof Error ? err.message : String(err)}`, { exitCode: 1 });
  }

  // Check if pagination is already exhausted
  if (paginationHandler.isExhausted) {
    const format = (opts.output ?? 'text') as 'text' | 'json' | 'ndjson';
    const exhaustedPagination = paginationHandler.getExhaustedPagination(opts.limit);
    if (exhaustedPagination) {
      if (format === 'ndjson') {
        if (opts.mergedStream) {
          process.stdout.write(JSON.stringify({ _meta: { pagination: exhaustedPagination } }) + '\n');
        }
      } else if (format === 'json') {
        process.stdout.write(JSON.stringify({ pagination: exhaustedPagination, data: [] }));
      }
      process.stderr.write(`Complete (${exhaustedPagination.total} results).\n`);
    }
    return;
  }

  // When --all is specified, don't apply limit or offset
  const limit = opts.all ? undefined : opts.limit;
  const offset = opts.all ? undefined : paginationHandler.offset;

  const result = await store.queryWithFilter({
    source,
    type: opts.type,
    filterExpr,
    allowedColumns,
    limit,
    offset,
  });

  const permissionsEngine = new PermissionsEngine();
  await permissionsEngine.loadRulesFromConfig(config);

  const filteredEntities = permissionsEngine.filter(result.entities, {});
  const filteredCount = result.entities.length - filteredEntities.length;
  const format = (opts.output ?? 'text') as 'text' | 'json' | 'ndjson';
  const adjustedTotal = result.total - filteredCount;

  // Don't include pagination info when --all is used (no limit applies)
  const pagination = !opts.all && limit ? {
    offset: offset ?? 0,
    limit: limit,
    total: adjustedTotal,
  } : undefined;

  // Get formatter for the entity type (use first result's type, or 'file' as default)
  const entityType = opts.type || filteredEntities[0]?.type || 'file';
  const formatter = connector.getFormatter(entityType);

  const printer = createPrinter(format, {
    fields: opts.fields.flat(),
    pagination,
    formatter,
    mergedStream: opts.mergedStream,
  });

  printer.printEntities(filteredEntities);
  printer.printMetadata();

  // Handle pagination state update and hints
  if (pagination) {
    const hint = paginationHandler.advance(pagination.total, filteredEntities.length);
    if (hint) {
      process.stderr.write(hint + '\n');
    }
  }

  if (filteredCount > 0) {
    printer.printNotice(`${filteredCount} result${filteredCount !== 1 ? 's' : ''} filtered by rules`);
  }
}
