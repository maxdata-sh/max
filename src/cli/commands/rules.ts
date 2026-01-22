import { Command } from 'commander';
import { ConfigManager } from '../../core/config-manager.js';
import { PermissionsEngine } from '../../core/permissions-engine.js';
import { renderRules, renderSuccess, renderError, type OutputFormat } from '../output.js';
import * as fs from 'fs';
import * as path from 'path';

export const rulesCommand = new Command('rules')
  .description('Manage permission rules');

rulesCommand
  .command('list')
  .description('List all loaded rules')
  .option('-o, --output <format>', 'Output format (text, json)', 'text')
  .action(async (options: { output: string }) => {
    try {
      const config = ConfigManager.find();
      if (!config) {
        console.error(renderError('Not in a Max project. Run "max init" first.'));
        process.exit(1);
      }

      const permissionsEngine = new PermissionsEngine();
      await permissionsEngine.loadRulesFromConfig(config);

      const rules = permissionsEngine.getRules();
      console.log(renderRules(rules, options.output as OutputFormat));
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to list rules'));
      process.exit(1);
    }
  });

rulesCommand
  .command('apply <file>')
  .description('Apply a rules file')
  .action(async (file: string) => {
    try {
      const config = ConfigManager.find();
      if (!config) {
        console.error(renderError('Not in a Max project. Run "max init" first.'));
        process.exit(1);
      }

      // Check if file exists
      const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        console.error(renderError(`File not found: ${file}`));
        process.exit(1);
      }

      // Copy file to .max/rules/ directory
      const rulesDir = config.getRulesDir();
      const destPath = path.join(rulesDir, path.basename(file));
      fs.copyFileSync(filePath, destPath);

      // Validate the rules
      const permissionsEngine = new PermissionsEngine();
      await permissionsEngine.loadRules(destPath);

      const rules = permissionsEngine.getRules();
      console.log(renderSuccess(`Applied ${rules.length} rule${rules.length !== 1 ? 's' : ''} from ${file}`));

      for (const rule of rules) {
        console.log(`  - ${rule.name} (${rule.type})`);
      }
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to apply rules'));
      process.exit(1);
    }
  });

rulesCommand
  .command('remove <name>')
  .description('Remove a rule by name')
  .action(async (name: string) => {
    try {
      const config = ConfigManager.find();
      if (!config) {
        console.error(renderError('Not in a Max project. Run "max init" first.'));
        process.exit(1);
      }

      const rulesDir = config.getRulesDir();
      const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      let removed = false;
      for (const file of files) {
        const filePath = path.join(rulesDir, file);
        const permissionsEngine = new PermissionsEngine();
        await permissionsEngine.loadRules(filePath);

        const rules = permissionsEngine.getRules();
        const hasRule = rules.some(r => r.name === name);

        if (hasRule) {
          // For simplicity, if the file contains only rules with this name, delete it
          // Otherwise, we'd need to parse and rewrite the YAML
          if (rules.length === 1 || rules.every(r => r.name === name)) {
            fs.unlinkSync(filePath);
            removed = true;
          } else {
            console.error(renderError(`Rule "${name}" is in file ${file} with other rules. Please edit the file manually.`));
            process.exit(1);
          }
        }
      }

      if (removed) {
        console.log(renderSuccess(`Removed rule: ${name}`));
      } else {
        console.error(renderError(`Rule not found: ${name}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : 'Failed to remove rule'));
      process.exit(1);
    }
  });
