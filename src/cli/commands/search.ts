import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderEntities, renderError, type OutputFormat } from '../output.js';
import type { Filter } from '../../types/entity.js';

export const searchCommand = new Command('search')
  .description('Query entities from a source')
  .argument('<source>', 'Source to search (e.g., gdrive)')
  .option('-t, --type <type>', 'Filter by entity type (file, folder, document, spreadsheet)')
  .option('--owner <email>', 'Filter by owner email')
  .option('--path <pattern>', 'Filter by path (glob pattern)')
  .option('--mimeType <type>', 'Filter by MIME type')
  .option('--name <pattern>', 'Filter by name (glob pattern)')
  .option('--limit <n>', 'Maximum results to return', '50')
  .option('--offset <n>', 'Skip first n results', '0')
  .option('-o, --output <format>', 'Output format (text, json)', 'text')
  .action(async (source: string, options: {
    type?: string;
    owner?: string;
    path?: string;
    mimeType?: string;
    name?: string;
    limit: string;
    offset: string;
    output: string;
  }) => {
    try {
      const config = ConfigManager.find();
      if (!config) {
        console.error(renderError('Not in a Max project. Run "max init" first.'));
        process.exit(1);
      }

      const store = new EntityStore(config);
      await store.initialize();

      // Build filters from options
      const filters: Filter[] = [];

      if (options.owner) {
        filters.push({ field: 'owner', op: '=', value: options.owner });
      }

      if (options.path) {
        filters.push({ field: 'path', op: 'like', value: options.path });
      }

      if (options.mimeType) {
        filters.push({ field: 'mimeType', op: '=', value: options.mimeType });
      }

      if (options.name) {
        filters.push({ field: 'name', op: 'like', value: options.name });
      }

      // Handle type filter (map friendly names to MIME types)
      let entityType: string | undefined;
      if (options.type) {
        const typeMap: Record<string, string> = {
          'document': 'application/vnd.google-apps.document',
          'spreadsheet': 'application/vnd.google-apps.spreadsheet',
          'presentation': 'application/vnd.google-apps.presentation',
          'folder': 'application/vnd.google-apps.folder',
        };

        if (typeMap[options.type]) {
          filters.push({ field: 'mimeType', op: '=', value: typeMap[options.type] });
        } else if (options.type === 'file') {
          entityType = 'file';
        } else {
          entityType = options.type;
        }
      }

      const result = await store.query({
        source,
        type: entityType,
        filters,
        limit: parseInt(options.limit, 10),
        offset: parseInt(options.offset, 10),
      });

      // Apply permission rules
      const permissionsEngine = new PermissionsEngine();
      await permissionsEngine.loadRulesFromConfig(config);

      const filteredEntities = permissionsEngine.filter(result.entities, {});

      // Check if any results were filtered
      const filteredCount = result.entities.length - filteredEntities.length;

      console.log(renderEntities(filteredEntities, options.output as OutputFormat, result.total - filteredCount));

      if (filteredCount > 0 && options.output === 'text') {
        console.log(`(${filteredCount} result${filteredCount !== 1 ? 's' : ''} filtered by rules)`);
      }
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Search failed'));
      process.exit(1);
    }
  });
