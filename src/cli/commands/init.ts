import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { renderSuccess, renderError } from '../output.js';

export const initCommand = new Command('init')
  .description('Initialize a new Max project')
  .argument('[directory]', 'Directory to initialize', '.')
  .action(async (directory: string) => {
    try {
      const config = new ConfigManager(directory);
      await config.initialize();
      console.log(renderSuccess(`Initialized Max project in ${directory === '.' ? 'current directory' : directory}`));
      console.log('\nNext steps:');
      console.log('  max connect gdrive    Connect your Google Drive');
      console.log('  max sync gdrive       Sync data from Google Drive');
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to initialize project'));
      process.exit(1);
    }
  });
