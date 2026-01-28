import { object } from '@optique/core/constructs';
import { optional, withDefault } from '@optique/core/modifiers';
import { argument, option, constant } from '@optique/core/primitives';
import { integer, string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import * as fs from 'node:fs';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { BasicFilterParser } from '../../core/filter/basic-parser.js';
import { renderEntities, flattenEntity, pickFields, type OutputFormat } from '../output.js';
import { sourceArg, entityTypeArg, outputOptionWithNdjson, fieldsOption } from '../parsers.js';
import type { FilterExpr } from '../../types/filter.js';
import type { EntitySchema } from '../../types/connector.js';
import type { StoredEntity } from '../../types/entity.js';

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
  all: option('--all', { description: message`Return all results (no limit)` }),
  limit: withDefault(option('--limit', integer({ min: 1 }), { description: message`Maximum results` }), 50),
  offset: withDefault(option('--offset', integer({ min: 0 }), { description: message`Skip first n results` }), 0),
  output: outputOptionWithNdjson,
  fields: fieldsOption,
  mergedStream: option('--merged-stream', { description: message`Write all ndjson output to stdout (metadata last)` }),
});

/**
 * Try to write metadata to FD 3.
 * Returns true if successful, false if FD 3 is not available.
 */
function tryWriteToFd3(data: string): boolean {
  try {
    fs.writeSync(3, data + '\n');
    return true;
  } catch {
    // FD 3 not available - user didn't redirect it
    return false;
  }
}

/**
 * Format entities for NDJSON output.
 * Each entity becomes a single JSON line with flattened properties.
 */
function formatNdjsonEntity(entity: StoredEntity, fields?: readonly string[]): string {
  const flattened = flattenEntity(entity);
  const output = fields && fields.length > 0 ? pickFields(flattened, fields) : flattened;
  return JSON.stringify(output);
}

export async function handleSearch(opts: {
  source: string;
  type?: string;
  filter?: string;
  all: boolean;
  limit: number;
  offset: number;
  output?: 'text' | 'json' | 'ndjson';
  fields: readonly (readonly string[])[];
  mergedStream: boolean;
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

  // When --all is specified, don't apply limit or offset
  const limit = opts.all ? undefined : opts.limit;
  const offset = opts.all ? undefined : opts.offset;

  const result = await store.queryWithFilter({
    source: opts.source,
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
  const format = (opts.output ?? 'text') as OutputFormat;
  const adjustedTotal = result.total - filteredCount;

  // Don't include pagination info when --all is used (no limit applies)
  const pagination = !opts.all && limit ? {
    offset: offset ?? 0,
    limit: limit,
    total: adjustedTotal,
  } : undefined;

  // TODO: This is too messy. There should be a Printer class for these two output types

  // Handle NDJSON output format
  if (format === 'ndjson') {
    const flatFields = opts.fields.flat();
    const hasFields = flatFields.length > 0;

    // Write data records to stdout
    for (const entity of filteredEntities) {
      console.log(formatNdjsonEntity(entity, hasFields ? flatFields : undefined));
    }

    // Build metadata object
    const meta = {
      _meta: {
        pagination: pagination
          ? {
              offset: pagination.offset,
              limit: pagination.limit,
              total: pagination.total,
              hasMore: pagination.offset + filteredEntities.length < pagination.total,
            }
          : null,
      },
    };

    if (opts.mergedStream) {
      // --merged-stream: write metadata as last line to stdout
      console.log(JSON.stringify(meta));
    } else {
      // Default: write metadata to FD 3 (silently skip if not available)
      tryWriteToFd3(JSON.stringify(meta));
    }

    if (filteredCount > 0) {
      // Write filter notice to stderr so it doesn't interfere with data
      console.error(`(${filteredCount} result${filteredCount !== 1 ? 's' : ''} filtered by rules)`);
    }
    return;
  }
  const data = (renderEntities(filteredEntities, format, connector.formatEntity.bind(connector), {
    pagination,
    fields: opts.fields.flat(),
  }));

  // Avoid console.log so we aren't buffering
  process.stdout.write(data);


  if (filteredCount > 0 && format === 'text') {
    print(message`(${filteredCount.toString()} result${filteredCount !== 1 ? 's' : ''} filtered by rules)`);
  }
}
