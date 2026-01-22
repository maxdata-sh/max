#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { connectCommand } from './commands/connect.js';
import { syncCommand } from './commands/sync.js';
import { schemaCommand } from './commands/schema.js';
import { searchCommand } from './commands/search.js';
import { getCommand } from './commands/get.js';
import { permissionsCommand } from './commands/permissions.js';
import { rulesCommand } from './commands/rules.js';

const program = new Command();

program
  .name('max')
  .description('Data Pipe CLI - fat pipe beats thin straw')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(connectCommand);
program.addCommand(syncCommand);
program.addCommand(schemaCommand);
program.addCommand(searchCommand);
program.addCommand(getCommand);
program.addCommand(permissionsCommand);
program.addCommand(rulesCommand);

program.parse();
