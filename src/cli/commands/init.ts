import { object } from '@optique/core/constructs';
import { withDefault } from '@optique/core/modifiers';
import { argument, constant } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';

export const initCommand = object({
  cmd: constant('init' as const),
  directory: withDefault(argument(string(), { description: message`Directory to initialize` }), '.'),
});

export async function handleInit(opts: { directory: string }) {
  const config = new ConfigManager(opts.directory);
  await config.initialize();

  const location = opts.directory === '.' ? 'current directory' : opts.directory;
  print(message`✓ Initialized Max project in ${location}`);
  print(message`
Next steps:
  max connect gdrive    Connect your Google Drive
  max sync gdrive       Sync data from Google Drive`);
}
