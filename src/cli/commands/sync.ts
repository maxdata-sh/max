import { object } from '@optique/core/constructs';
import { argument, option, constant } from '@optique/core/primitives';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { sourceArg } from '../parsers.js';

export const syncCommand = object({
  cmd: constant('sync' as const),
  source: argument(sourceArg, { description: message`Source to sync (e.g., gdrive)` }),
  includeContent: option('--include-content', { description: message`Also download and extract file content` }),
});

export async function handleSync(opts: { source: string; includeContent: boolean }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const registry = new ConnectorRegistry(config);
  const connector = registry.get(opts.source);

  if (!connector) {
    printError(message`Unknown source: ${opts.source}`, { exitCode: 1 });
  }

  if (!registry.isReady(opts.source)) {
    printError(message`Source ${opts.source} is not configured. Run "max connect ${opts.source}" first.`, { exitCode: 1 });
  }

  const store = new EntityStore(config);
  await store.initialize();
  await store.setSchema(connector.schema);

  const permissionsEngine = new PermissionsEngine();

  print(message`→ Syncing metadata from ${opts.source}...`);

  let fileCount = 0;
  let folderCount = 0;

  for await (const rawEntity of connector.sync()) {
    const normalizedPerms = permissionsEngine.normalize(opts.source, rawEntity.permissions);
    await store.upsert({
      source: opts.source,
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

    if ((fileCount + folderCount) % 100 === 0) {
      print(message`→ Processed ${fileCount.toString()} files, ${folderCount.toString()} folders...`);
    }
  }

  print(message`✓ Metadata sync complete`);
  print(message`  Files: ${fileCount.toString()}`);
  print(message`  Folders: ${folderCount.toString()}`);

  let contentCount = 0;
  if (opts.includeContent) {
    print(message`→ Extracting content...`);

    const PAGE_SIZE = 1000;
    let offset = 0;
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      const { entities, total } = await store.query({
        source: opts.source,
        type: 'file',
        limit: PAGE_SIZE,
        offset,
      });

      for (const entity of entities) {
        const content = await connector.getContent(entity.id);
        if (content) {
          await store.storeContent(opts.source, entity.id, content);
          contentCount++;
        }
        processed++;

        if (processed % 50 === 0) {
          print(message`→ Extracted ${contentCount.toString()} of ${processed.toString()}/${total.toString()} files...`);
        }
      }

      offset += PAGE_SIZE;
      hasMore = entities.length === PAGE_SIZE;
    }

    print(message`✓ Content extraction complete`);
    print(message`  Content extracted: ${contentCount.toString()}`);
  }

  await config.updateLastSync(opts.source);
}
