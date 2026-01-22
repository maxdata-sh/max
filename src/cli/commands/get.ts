import { object } from '@optique/core/constructs';
import { argument, option, constant } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { EntityStore } from '../../core/entity-store.js';
import { sourceArg, outputOption } from '../parsers.js';

export const getCommand = object({
  cmd: constant('get' as const),
  source: argument(sourceArg, { description: message`Source (e.g., gdrive)` }),
  id: argument(string({ metavar: 'ID' }), { description: message`Entity ID` }),
  content: option('--content', { description: message`Include extracted content if available` }),
  output: outputOption,
});

export async function handleGet(opts: {
  source: string;
  id: string;
  content: boolean;
  output?: 'text' | 'json';
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const store = new EntityStore(config);
  await store.initialize();

  const entity = await store.get(opts.source, opts.id);

  if (!entity) {
    printError(message`Entity not found: ${opts.id}`, { exitCode: 1 });
  }

  if (opts.output === 'json') {
    const output: Record<string, unknown> = { ...entity };
    if (opts.content) {
      const content = await store.getContent(opts.source, opts.id);
      if (content) {
        output.content = content;
      }
    }
    console.log(JSON.stringify(output, null, 2));
  } else {
    const props = entity.properties;
    print(message`${(props.name as string) || opts.id}`);
    print(message``);
    print(message`Properties:`);
    print(message`  ID: ${entity.id}`);
    print(message`  Type: ${entity.type}`);
    if (props.path) print(message`  Path: ${props.path as string}`);
    if (props.owner) print(message`  Owner: ${props.owner as string}`);
    if (props.mimeType) print(message`  MIME Type: ${props.mimeType as string}`);
    if (props.size) print(message`  Size: ${String(props.size)} bytes`);
    if (props.createdAt) print(message`  Created: ${props.createdAt as string}`);
    if (props.modifiedAt) print(message`  Modified: ${props.modifiedAt as string}`);
    print(message`  Synced: ${entity.syncedAt.toISOString()}`);

    print(message``);
    print(message`Permissions:`);
    for (const perm of entity.permissions) {
      const who = perm.principal.identifier || perm.principal.type;
      print(message`  - ${who}: ${perm.access}`);
    }

    if (opts.content) {
      const content = await store.getContent(opts.source, opts.id);
      if (content) {
        print(message``);
        print(message`Content:`);
        print(message`---`);
        console.log(content.content.substring(0, 1000));
        if (content.content.length > 1000) {
          print(message`... (${(content.content.length - 1000).toString()} more characters)`);
        }
      }
    }
  }
}
