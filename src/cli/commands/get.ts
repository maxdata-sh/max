import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { EntityStore } from '../../core/entity-store.js';
import { renderError, type OutputFormat } from '../output.js';

export const getCommand = new Command('get')
  .description('Get a single entity with full details')
  .argument('<source>', 'Source (e.g., gdrive)')
  .argument('<id>', 'Entity ID')
  .option('-o, --output <format>', 'Output format (text, json)', 'text')
  .option('--content', 'Include extracted content if available')
  .action(async (source: string, id: string, options: { output: string; content?: boolean }) => {
    try {
      const config = ConfigManager.find();
      if (!config) {
        console.error(renderError('Not in a Max project. Run "max init" first.'));
        process.exit(1);
      }

      const store = new EntityStore(config);
      await store.initialize();

      const entity = await store.get(source, id);

      if (!entity) {
        console.error(renderError(`Entity not found: ${id}`));
        process.exit(1);
      }

      if (options.output === 'json') {
        const output: Record<string, unknown> = { ...entity };
        if (options.content) {
          const content = await store.getContent(source, id);
          if (content) {
            output.content = content;
          }
        }
        console.log(JSON.stringify(output, null, 2));
      } else {
        const props = entity.properties;
        console.log(`${props.name || id}`);
        console.log('');
        console.log('Properties:');
        console.log(`  ID: ${entity.id}`);
        console.log(`  Type: ${entity.type}`);
        if (props.path) console.log(`  Path: ${props.path}`);
        if (props.owner) console.log(`  Owner: ${props.owner}`);
        if (props.mimeType) console.log(`  MIME Type: ${props.mimeType}`);
        if (props.size) console.log(`  Size: ${props.size} bytes`);
        if (props.createdAt) console.log(`  Created: ${props.createdAt}`);
        if (props.modifiedAt) console.log(`  Modified: ${props.modifiedAt}`);
        console.log(`  Synced: ${entity.syncedAt.toISOString()}`);

        console.log('');
        console.log('Permissions:');
        for (const perm of entity.permissions) {
          const who = perm.principal.identifier || perm.principal.type;
          console.log(`  - ${who}: ${perm.access}`);
        }

        if (options.content) {
          const content = await store.getContent(source, id);
          if (content) {
            console.log('');
            console.log('Content:');
            console.log('---');
            console.log(content.content.substring(0, 1000));
            if (content.content.length > 1000) {
              console.log(`... (${content.content.length - 1000} more characters)`);
            }
          }
        }
      }
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to get entity'));
      process.exit(1);
    }
  });
