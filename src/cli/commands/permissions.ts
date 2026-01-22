import { object } from '@optique/core/constructs';
import { argument, constant } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderPermissions, type OutputFormat } from '../output.js';
import { sourceArg, outputOption } from '../parsers.js';
import type { SourcePermission } from '../../types/connector.js';

export const permissionsCommand = object({
  cmd: constant('permissions' as const),
  source: argument(sourceArg, { description: message`Source (e.g., gdrive)` }),
  entityPath: argument(string({ metavar: 'PATH' }), { description: message`Path to the entity` }),
  output: outputOption,
});

export async function handlePermissions(opts: {
  source: string;
  entityPath: string;
  output?: 'text' | 'json';
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const store = new EntityStore(config);
  await store.initialize();

  const result = await store.query({
    source: opts.source,
    filters: [{ field: 'path', op: '=', value: opts.entityPath }],
    limit: 1,
  });

  if (result.entities.length === 0) {
    printError(message`Entity not found at path: ${opts.entityPath}`, { exitCode: 1 });
  }

  const entity = result.entities[0];

  const permissionsEngine = new PermissionsEngine();
  await permissionsEngine.loadRulesFromConfig(config);

  const summary = permissionsEngine.describe(entity);

  const sourcePerms: SourcePermission[] = entity.permissions.map(p => ({
    type: p.principal.type === 'public' ? 'anyone' : p.principal.type,
    role: p.access === 'owner' ? 'owner' : p.access === 'write' ? 'writer' : 'reader',
    email: p.principal.identifier,
  }));

  const fullSummary = {
    ...summary,
    source: {
      type: opts.source,
      permissions: sourcePerms,
    },
  };

  console.log(renderPermissions(fullSummary, (opts.output ?? 'text') as OutputFormat));
}
