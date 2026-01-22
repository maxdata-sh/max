import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderSuccess, renderError, renderProgress } from '../output.js';

export const syncCommand = new Command('sync')
  .description('Sync data from a source')
  .argument('<source>', 'Source to sync (e.g., gdrive)')
  .action(async (source: string) => {
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

      console.log(renderProgress(`Syncing from ${source}...`));

      let fileCount = 0;
      let folderCount = 0;
      let contentCount = 0;

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

        // Try to extract content
        const content = await connector.getContent(rawEntity.id);
        if (content) {
          await store.storeContent(source, rawEntity.id, content);
          contentCount++;
        }

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

      await config.updateLastSync(source);

      console.log(renderSuccess(`Sync complete`));
      console.log(`  Files: ${fileCount}`);
      console.log(`  Folders: ${folderCount}`);
      console.log(`  Content extracted: ${contentCount}`);
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Sync failed'));
      process.exit(1);
    }
  });
