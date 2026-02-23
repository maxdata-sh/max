import { LazyX } from '@max/core'
import { argument, command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { ErrInvariant, type InstallationClient } from '@max/federation'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'

export class CmdSyncWorkspace implements Command {
  readonly name = 'sync'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'sync',
    object({
      cmd: constant('sync'),
      installation: argument(this.services.completers.installationName, {
        description: message`Installation to sync`,
      }),
    }),
    { description: message`Sync data from a connected source` }
  ))

  async run(args: Inferred<this>) {
    const installations = await this.services.ctx.workspace.listInstallations()
    const match = installations.find(i => i.name === args.installation)
    if (!match) {
      throw ErrInvariant.create({
        detail: `No installation found: ${args.installation}`,
      })
    }
    const inst = this.services.ctx.workspace.installation(match.id)
    return runSync(inst)
  }
}

export class CmdSyncInstallation implements Command {
  readonly name = 'sync'
  readonly level = 'installation' as const

  constructor(private services: CliServices<'installation'>) {}

  parser = LazyX.once(() => command(
    'sync',
    object({
      cmd: constant('sync'),
    }),
    { description: message`Sync data from this installation` }
  ))

  async run(_args: Inferred<this>) {
    return runSync(this.services.ctx.installation)
  }
}

async function runSync(installation: InstallationClient): Promise<string> {
  const handle = await installation.sync()
  const result = await handle.completion()

  await installation.stop()

  const lines = [
    `Sync ${result.status} in ${result.duration}ms`,
    `  Tasks completed: ${result.tasksCompleted}`,
    `  Tasks failed:    ${result.tasksFailed}`,
  ]
  return lines.join('\n')
}
