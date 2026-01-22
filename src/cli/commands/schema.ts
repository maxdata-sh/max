import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { renderSchema, renderError, type OutputFormat } from '../output.js';

export const schemaCommand = new Command('schema')
  .description('Display the entity schema for a source')
  .argument('<source>', 'Source to show schema for (e.g., gdrive)')
  .option('-o, --output <format>', 'Output format (text, json)', 'text')
  .action(async (source: string, options: { output: string }) => {
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

      console.log(renderSchema(connector.schema, options.output as OutputFormat));
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to get schema'));
      process.exit(1);
    }
  });
