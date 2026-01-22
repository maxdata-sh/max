import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { renderSuccess, renderError, renderProgress } from '../output.js';

export const connectCommand = new Command('connect')
  .description('Configure and authenticate a connector')
  .argument('<source>', 'Source to connect (e.g., gdrive)')
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
        console.error(renderError(`Unknown source: ${source}. Available sources: ${registry.list().join(', ')}`));
        process.exit(1);
      }

      console.log(renderProgress(`Connecting to ${source}...`));
      const credentials = await connector.authenticate();
      await config.saveCredentials(source, credentials);
      await config.markSourceConfigured(source);

      console.log(renderSuccess(`Connected to ${source}`));
      console.log('\nNext step:');
      console.log(`  max sync ${source}    Sync data from ${source}`);
      process.exit(0);
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to connect'));
      process.exit(1);
    }
  });
