import { object, or } from '@optique/core/constructs';
import { argument, command, constant } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderRules, type OutputFormat } from '../output.js';
import { outputOption } from '../parsers.js';
import * as fs from 'fs';
import * as path from 'path';

const rulesListCommand = object({
  cmd: constant('rules' as const),
  subcmd: constant('list' as const),
  output: outputOption,
});

const rulesApplyCommand = object({
  cmd: constant('rules' as const),
  subcmd: constant('apply' as const),
  file: argument(string({ metavar: 'FILE' }), { description: message`Rules file to apply` }),
});

const rulesRemoveCommand = object({
  cmd: constant('rules' as const),
  subcmd: constant('remove' as const),
  name: argument(string({ metavar: 'NAME' }), { description: message`Rule name to remove` }),
});

export const rulesCommand = or(
  command('list', rulesListCommand, { description: message`List all loaded rules` }),
  command('apply', rulesApplyCommand, { description: message`Apply a rules file` }),
  command('remove', rulesRemoveCommand, { description: message`Remove a rule by name` }),
);

type RulesResult =
  | { cmd: 'rules'; subcmd: 'list'; output?: 'text' | 'json' }
  | { cmd: 'rules'; subcmd: 'apply'; file: string }
  | { cmd: 'rules'; subcmd: 'remove'; name: string };

export async function handleRules(opts: RulesResult) {
  switch (opts.subcmd) {
    case 'list':
      return handleRulesList(opts);
    case 'apply':
      return handleRulesApply(opts);
    case 'remove':
      return handleRulesRemove(opts);
  }
}

async function handleRulesList(opts: { output?: 'text' | 'json' }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const permissionsEngine = new PermissionsEngine();
  await permissionsEngine.loadRulesFromConfig(config);

  const rules = permissionsEngine.getRules();
  console.log(renderRules(rules, (opts.output ?? 'text') as OutputFormat));
}

async function handleRulesApply(opts: { file: string }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const filePath = path.isAbsolute(opts.file) ? opts.file : path.join(process.cwd(), opts.file);
  if (!fs.existsSync(filePath)) {
    printError(message`File not found: ${opts.file}`, { exitCode: 1 });
  }

  const rulesDir = config.getRulesDir();
  const destPath = path.join(rulesDir, path.basename(opts.file));
  fs.copyFileSync(filePath, destPath);

  const permissionsEngine = new PermissionsEngine();
  await permissionsEngine.loadRules(destPath);

  const rules = permissionsEngine.getRules();
  print(message`✓ Applied ${rules.length.toString()} rule${rules.length !== 1 ? 's' : ''} from ${opts.file}`);

  for (const rule of rules) {
    print(message`  - ${rule.name} (${rule.type})`);
  }
}

async function handleRulesRemove(opts: { name: string }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const rulesDir = config.getRulesDir();
  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  let removed = false;
  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    const permissionsEngine = new PermissionsEngine();
    await permissionsEngine.loadRules(filePath);

    const rules = permissionsEngine.getRules();
    const hasRule = rules.some(r => r.name === opts.name);

    if (hasRule) {
      if (rules.length === 1 || rules.every(r => r.name === opts.name)) {
        fs.unlinkSync(filePath);
        removed = true;
      } else {
        printError(message`Rule "${opts.name}" is in file ${file} with other rules. Please edit the file manually.`, { exitCode: 1 });
      }
    }
  }

  if (removed) {
    print(message`✓ Removed rule: ${opts.name}`);
  } else {
    printError(message`Rule not found: ${opts.name}`, { exitCode: 1 });
  }
}
