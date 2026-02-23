import { LazyX } from '@max/core'
import { argument, command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { InMemoryCredentialStore } from '@max/connector'
import { BunPlatform } from '@max/platform-bun'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'
import { runOnboarding } from '../onboarding-runner.js'
import { DirectPrompter } from '../prompter.js'
import * as path from 'node:path'

export class CmdConnect implements Command {
  readonly name = 'connect'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'connect',
    object({
      cmd: constant('connect'),
      source: argument(this.services.completers.connectorSource, {
        description: message`Connector to set up`,
      }),
    }),
    { description: message`Connect a new data source` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const ws = this.services.ctx.workspace
    const flow = await ws.connectorOnboarding(args.source)

    const wsDataDir = await this.services.getWorkspaceDataDir()

    const memStore = new InMemoryCredentialStore()
    const ownedPrompter = opts.prompter ? null : new DirectPrompter()
    const resolved = opts.prompter ?? ownedPrompter!
    try {
      const config = await runOnboarding(flow, { credentialStore: memStore }, resolved)

      const credentialKeys = await memStore.keys()
      const initialCredentials: Record<string, string> = {}
      for (const key of credentialKeys) {
        initialCredentials[key] = await memStore.get(key)
      }

      const id = await ws.createInstallation({
        via: BunPlatform.installation.deploy.inProcess,
        config: {
          strategy: 'in-process',
          dataDir: path.join(wsDataDir, 'installations', args.source),
        },
        spec: {
          connector: args.source,
          connectorConfig: config,
          initialCredentials: credentialKeys.length > 0 ? initialCredentials : undefined,
        },
      })

      return `Connected ${args.source} as installation ${id}`
    } finally {
      ownedPrompter?.close()
    }
  }
}
