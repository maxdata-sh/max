import { object } from '@optique/core/constructs';
import { argument, constant } from '@optique/core/primitives';
import { message } from '@optique/core/message';
import { printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { renderSchema, type OutputFormat } from '../output.js';
import { sourceArg, outputOption } from '../parsers.js';

export const schemaCommand = object({
  cmd: constant('schema' as const),
  source: argument(sourceArg, { description: message`Source to show schema for` }),
  output: outputOption,
});

export async function handleSchema(opts: { source: string; output?: 'text' | 'json' }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const registry = new ConnectorRegistry(config);
  const connector = await registry.get(opts.source);

  if (!connector) {
    printError(message`Unknown source: ${opts.source}`, { exitCode: 1 });
  }

  console.log(renderSchema(connector.schema, (opts.output ?? 'text') as OutputFormat));
}
