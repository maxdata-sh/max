import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderSuccess, renderError, renderProgress } from '../output.js';

export const syncCommand = new Command('sync')
  .description('Sync data from a source')
  .argument('<source>', 'Source to sync (e.g., gdrive)')
  .option('--include-content', 'Also download and extract file content')
  .action(async (source: string, options: { includeContent?: boolean }) => {
    try {
      const config = ConfigManager.find();
      if (!config) {
        console.error(renderError('Not in a Max project. Run "max init" first.'));
        process.exit(1);
      }

      const registry = new ConnectorRegistry(config);
      const connector = registry.get(source);

      if (!connector) {
        console.error(renderError(`Unknown source: ${source}`));
        process.exit(1);
      }

      if (!registry.isReady(source)) {
        console.error(renderError(`Source ${source} is not configured. Run "max connect ${source}" first.`));
        process.exit(1);
      }

      const store = new EntityStore(config);
      await store.initialize();
      await store.setSchema(connector.schema);

      const permissionsEngine = new PermissionsEngine();

      console.log(renderProgress(`Syncing metadata from ${source}...`));

      let fileCount = 0;
      let folderCount = 0;

      // First pass: sync all metadata
      for await (const rawEntity of connector.sync()) {
        // Normalize permissions
        const normalizedPerms = permissionsEngine.normalize(source, rawEntity.permissions);

        // Store entity
        await store.upsert({
          source,
          id: rawEntity.id,
          type: rawEntity.type,
          properties: rawEntity.properties,
          permissions: normalizedPerms,
          syncedAt: new Date(),
        });

        if (rawEntity.type === 'folder') {
          folderCount++;
        } else {
          fileCount++;
        }

        // Progress update every 100 items
        if ((fileCount + folderCount) % 100 === 0) {
          console.log(renderProgress(`Processed ${fileCount} files, ${folderCount} folders...`));
        }
      }

      console.log(renderSuccess(`Metadata sync complete`));
      console.log(`  Files: ${fileCount}`);
      console.log(`  Folders: ${folderCount}`);

      // Second pass: extract content (if requested)
      let contentCount = 0;
      if (options.includeContent) {
        console.log(renderProgress(`Extracting content...`));

        const { entities } = await store.query({ source, type: 'file' });
        let processed = 0;

        for (const entity of entities) {
          const content = await connector.getContent(entity.id);
          if (content) {
            await store.storeContent(source, entity.id, content);
            contentCount++;
          }
          processed++;

          if (processed % 50 === 0) {
            console.log(renderProgress(`Extracted ${contentCount} of ${processed} files...`));
          }
        }

        console.log(renderSuccess(`Content extraction complete`));
        console.log(`  Content extracted: ${contentCount}`);
      }

      await config.updateLastSync(source);
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Sync failed'));
      process.exit(1);
    }
  });
