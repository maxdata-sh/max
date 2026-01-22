import { object } from '@optique/core/constructs';
import { argument, constant } from '@optique/core/primitives';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { sourceArg } from '../parsers.js';

export const connectCommand = object({
  cmd: constant('connect' as const),
  source: argument(sourceArg, { description: message`Source to connect (e.g., gdrive)` }),
});

export async function handleConnect(opts: { source: string }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const registry = new ConnectorRegistry(config);
  const connector = registry.get(opts.source);

  if (!connector) {
    const available = registry.list().join(', ');
    printError(message`Unknown source: ${opts.source}. Available sources: ${available}`, { exitCode: 1 });
  }

  print(message`→ Connecting to ${opts.source}...`);
  const credentials = await connector.authenticate();
  await config.saveCredentials(opts.source, credentials);
  await config.markSourceConfigured(opts.source);

  print(message`✓ Connected to ${opts.source}`);
  print(message`
Next step:
  max sync ${opts.source}    Sync data from ${opts.source}`);
  process.exit(0);
}
