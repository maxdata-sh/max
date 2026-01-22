import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderPermissions, renderError, type OutputFormat } from '../output.js';
import type { SourcePermission } from '../../types/connector.js';

export const permissionsCommand = new Command('permissions')
  .description('Show permissions for an entity')
  .argument('<source>', 'Source (e.g., gdrive)')
  .argument('<path>', 'Path to the entity')
  .option('-o, --output <format>', 'Output format (text, json)', 'text')
  .action(async (source: string, path: string, options: { output: string }) => {
    try {
      const config = ConfigManager.find();
      if (!config) {
        console.error(renderError('Not in a Max project. Run "max init" first.'));
        process.exit(1);
      }

      const store = new EntityStore(config);
      await store.initialize();

      // Find entity by path
      const result = await store.query({
        source,
        filters: [{ field: 'path', op: '=', value: path }],
        limit: 1,
      });

      if (result.entities.length === 0) {
        console.error(renderError(`Entity not found at path: ${path}`));
        process.exit(1);
      }

      const entity = result.entities[0];

      // Load rules and get permissions summary
      const permissionsEngine = new PermissionsEngine();
      await permissionsEngine.loadRulesFromConfig(config);

      const summary = permissionsEngine.describe(entity);

      // Add source permissions from raw data if available
      // For now, we reconstruct from normalized permissions
      const sourcePerms: SourcePermission[] = entity.permissions.map(p => ({
        type: p.principal.type === 'public' ? 'anyone' : p.principal.type,
        role: p.access === 'owner' ? 'owner' : p.access === 'write' ? 'writer' : 'reader',
        email: p.principal.identifier,
      }));

      const fullSummary = {
        ...summary,
        source: {
          type: source,
          permissions: sourcePerms,
        },
      };

      console.log(renderPermissions(fullSummary, options.output as OutputFormat));
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to get permissions'));
      process.exit(1);
    }
  });
