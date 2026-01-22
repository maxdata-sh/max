import { object } from '@optique/core/constructs';
import { constant } from '@optique/core/primitives';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const llmBootstrapCommand = object({
  cmd: constant('llm-bootstrap' as const),
});

export async function handleLlmBootstrap() {
  // Find AGENT.USER.md relative to the package root
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const agentMdPath = path.resolve(__dirname, '../../../AGENT.USER.md');

  const content = fs.readFileSync(agentMdPath, 'utf-8');
  console.log(content);
}
