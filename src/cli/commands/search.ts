import { object } from '@optique/core/constructs';
import { optional, withDefault } from '@optique/core/modifiers';
import { argument, option, constant } from '@optique/core/primitives';
import { string, integer } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderEntities, type OutputFormat } from '../output.js';
import { sourceArg, entityTypeArg, outputOption } from '../parsers.js';
import type { Filter } from '../../types/entity.js';

export const searchCommand = object({
  cmd: constant('search' as const),
  source: argument(sourceArg, { description: message`Source to search` }),
  type: optional(option('-t', '--type', entityTypeArg, { description: message`Filter by entity type` })),
  owner: optional(option('--owner', string({ metavar: 'EMAIL' }), { description: message`Filter by owner email` })),
  path: optional(option('--path', string({ metavar: 'PATTERN' }), { description: message`Filter by path (glob pattern)` })),
  mimeType: optional(option('--mimeType', string({ metavar: 'MIMETYPE' }), { description: message`Filter by MIME type` })),
  name: optional(option('--name', string({ metavar: 'PATTERN' }), { description: message`Filter by name (glob pattern)` })),
  limit: withDefault(option('--limit', integer({ min: 1 }), { description: message`Maximum results` }), 50),
  offset: withDefault(option('--offset', integer({ min: 0 }), { description: message`Skip first n results` }), 0),
  output: outputOption,
});

export async function handleSearch(opts: {
  source: string;
  type?: string;
  owner?: string;
  path?: string;
  mimeType?: string;
  name?: string;
  limit: number;
  offset: number;
  output?: 'text' | 'json';
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const store = new EntityStore(config);
  await store.initialize();

  const filters: Filter[] = [];

  if (opts.owner) {
    filters.push({ field: 'owner', op: '=', value: opts.owner });
  }

  if (opts.path) {
    filters.push({ field: 'path', op: 'like', value: opts.path });
  }

  if (opts.mimeType) {
    filters.push({ field: 'mimeType', op: '=', value: opts.mimeType });
  }

  if (opts.name) {
    filters.push({ field: 'name', op: 'like', value: opts.name });
  }

  let entityType: string | undefined;
  if (opts.type) {
    const typeMap: Record<string, string> = {
      'document': 'application/vnd.google-apps.document',
      'spreadsheet': 'application/vnd.google-apps.spreadsheet',
      'presentation': 'application/vnd.google-apps.presentation',
      'folder': 'application/vnd.google-apps.folder',
    };

    if (typeMap[opts.type]) {
      filters.push({ field: 'mimeType', op: '=', value: typeMap[opts.type] });
    } else if (opts.type === 'file') {
      entityType = 'file';
    } else {
      entityType = opts.type;
    }
  }

  const result = await store.query({
    source: opts.source,
    type: entityType,
    filters,
    limit: opts.limit,
    offset: opts.offset,
  });

  const permissionsEngine = new PermissionsEngine();
  await permissionsEngine.loadRulesFromConfig(config);

  const filteredEntities = permissionsEngine.filter(result.entities, {});
  const filteredCount = result.entities.length - filteredEntities.length;
  const format = (opts.output ?? 'text') as OutputFormat;

  console.log(renderEntities(filteredEntities, format, result.total - filteredCount));

  if (filteredCount > 0 && format === 'text') {
    print(message`(${filteredCount.toString()} result${filteredCount !== 1 ? 's' : ''} filtered by rules)`);
  }
}
