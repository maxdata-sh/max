import {describe, test} from 'bun:test'
import {BunPlatform, GlobalConfig} from "@max/platform-bun";
import {AcmeConfig} from "@max/connector-acme";
import {CLI} from "../cli.js";
import {object} from "@optique/core/constructs";
import {flag} from "@optique/core";
import {optional} from "@optique/core/modifiers";

describe('arg', () => {
 test("something", async () => {
  const cli = await createTestCli()

   const program = object({
     target: optional(flag('-t'))
   })

   const result = await cli.run('max://@/test-project', ["schema","linear"])
   console.log({result})
 })
});

async function createTestCli() {
  const global = BunPlatform.createGlobalMax({ ephemeral: true })
  await global.start()

  const wsId = await global.createWorkspace('test-project', {
    via: BunPlatform.workspace.deploy.inProcess,
    config: { strategy: 'in-process', dataDir: '/tmp/max-cli-test' },
    spec: { name: 'test-project' },
  })

  const workspace = global.workspace(wsId)
  await workspace.createInstallation({
    via: BunPlatform.installation.deploy.inProcess,
    config: {
      strategy: 'in-process',
      dataDir: '/tmp/max-cli-test/installations/default',
      credentials: { type: 'in-memory', initialSecrets: { api_token: 'test' } },
    },
    spec: {
      connector: 'acme',
      name: 'default',
      connectorConfig: { workspaceId: 'test', baseUrl: '' } satisfies AcmeConfig,
    },
  })

  const cfg = new GlobalConfig({ cwd: '/tmp', mode: 'direct', useColor: false })
  const cli = new CLI(cfg, { globalMax: global })

  return {
    cli,
    run: (target: string, argv: string[]) =>
      cli.execute({ kind: 'run', argv: ['-t', target, ...argv], color: false }),
    complete: (argv: string[]) => cli.execute({ kind: 'complete', argv, color: false }),
  }
}


