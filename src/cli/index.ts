import { or } from '@optique/core/constructs';
import { command } from '@optique/core/primitives';
import { message } from '@optique/core/message';
import { run } from '@optique/run';
import type { InferValue } from '@optique/core/parser';

import { initCommand, handleInit } from './commands/init.js';
import { connectCommand, handleConnect } from './commands/connect.js';
import { syncCommand, handleSync } from './commands/sync.js';
import { schemaCommand, handleSchema } from './commands/schema.js';
import { searchCommand, handleSearch } from './commands/search.js';
import { countCommand, handleCount } from './commands/count.js';
import { getCommand, handleGet } from './commands/get.js';
import { permissionsCommand, handlePermissions } from './commands/permissions.js';
import { rulesCommand, handleRules } from './commands/rules.js';
import { llmBootstrapCommand, handleLlmBootstrap } from './commands/llm-bootstrap.js';

// Main parser with all commands
const parser = or(
  command('init', initCommand, { description: message`Initialize a new Max project` }),
  command('connect', connectCommand, { description: message`Configure and authenticate a connector` }),
  command('sync', syncCommand, { description: message`Sync data from a source` }),
  command('schema', schemaCommand, { description: message`Display the entity schema for a source` }),
  command('search', searchCommand, { description: message`Query entities from a source` }),
  command('count', countCommand, { description: message`Count entities matching a filter` }),
  command('get', getCommand, { description: message`Get a single entity with full details` }),
  command('permissions', permissionsCommand, { description: message`Show permissions for an entity` }),
  command('rules', rulesCommand, { description: message`Manage permission rules` }),
  command('llm-bootstrap', llmBootstrapCommand, { description: message`Output agent usage guide` }),
);

type ParsedResult = InferValue<typeof parser>;

const result = run(parser, {
  programName: 'max',
  version: '0.1.0',
  description: message`Data Pipe CLI - fat pipe beats thin straw`,
  help: 'both',
  completion: 'both',
});

(async () => {
  try {
    switch (result.cmd) {
      case 'init':
        await handleInit(result);
        break;
      case 'connect':
        await handleConnect(result);
        break;
      case 'sync':
        await handleSync(result);
        break;
      case 'schema':
        await handleSchema(result);
        break;
      case 'search':
        await handleSearch(result);
        break;
      case 'count':
        await handleCount(result);
        break;
      case 'get':
        await handleGet(result);
        break;
      case 'permissions':
        await handlePermissions(result);
        break;
      case 'rules':
        await handleRules(result);
        break;
      case 'llm-bootstrap':
        await handleLlmBootstrap();
        break;
    }
  } catch (err) {
    console.error(err instanceof Error ? err : 'Command failed');
    process.exit(1);
  }
})();
