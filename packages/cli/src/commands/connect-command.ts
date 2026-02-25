import { LazyX } from '@max/core'
import { argument, command, constant, option } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { optional } from '@optique/core/modifiers'
import { message } from '@optique/core/message'
import { string } from '@optique/core/valueparser'
import { InMemoryCredentialStore } from '@max/connector'
import { deriveInstallationSlug } from '@max/federation'
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
      name: optional(option('-n', '--name', string(), {
        description: message`Installation name (auto-generated if omitted)`,
      })),
    }),
    { description: message`Connect a new data source` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const ws = this.services.ctx.workspace
    const flow = await ws.connectorOnboarding(args.source)

    const wsDataDir = await this.services.getWorkspaceDataDir()

    // Resolve installation name: user-supplied or auto-derived slug
    const existingNames = (await ws.listInstallations()).map(i => i.name)
    const installationName = args.name ?? deriveInstallationSlug(args.source, existingNames)

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
          dataDir: path.join(wsDataDir, 'installations', installationName),
        },
        spec: {
          connector: args.source,
          name: installationName,
          connectorConfig: config,
          initialCredentials: credentialKeys.length > 0 ? initialCredentials : undefined,
        },
      })

      return `Connected ${args.source} as installation ${installationName} (${id})`
    } finally {
      ownedPrompter?.close()
    }
  }
}
