import { LazyX } from '@max/core'
import { argument, command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { ErrInstallationNotFound, type InstallationClient } from '@max/federation'
import type { SyncObserver } from '@max/execution'
import type { Command, CommandOptions, Inferred } from '../../command.js'
import type { CliServices } from '../../cli-services.js'
import type { Prompter } from '../../prompter.js'
import { SyncProgressRenderer } from './sync-progress-renderer.js'

export class CmdSyncWorkspace implements Command {
  readonly name = 'sync'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() =>
    command(
      'sync',
      object({
        cmd: constant('sync'),
        installation: argument(this.services.completers.installationName, {
          description: message`Installation to sync`,
        }),
      }),
      { description: message`Sync data from a connected source` }
    )
  )

  async run(args: Inferred<this>, opts: CommandOptions) {
    const installations = await this.services.ctx.workspace.listInstallations()
    const match = installations.find((i) => i.name === args.installation)
    if (!match) {
      throw ErrInstallationNotFound.create({
        installation: args.installation,
      })
    }
    const inst = this.services.ctx.workspace.installation(match.id)
    return runSync(inst, opts.prompter)
  }
}

export class CmdSyncInstallation implements Command {
  readonly name = 'sync'
  readonly level = 'installation' as const

  constructor(private services: CliServices<'installation'>) {}

  parser = LazyX.once(() =>
    command(
      'sync',
      object({
        cmd: constant('sync'),
      }),
      { description: message`Sync data from this installation` }
    )
  )

  async run(_args: Inferred<this>, opts: CommandOptions) {
    return runSync(this.services.ctx.installation, opts.prompter)
  }
}

// ============================================================================
// Sync runner with live progress
// ============================================================================

async function runSync(installation: InstallationClient, prompter?: Prompter): Promise<string> {
  const renderer = prompter ? new SyncProgressRenderer(prompter) : undefined
  const observer: SyncObserver | undefined = renderer
    ? { onEvent: (e) => renderer.onEvent(e) }
    : undefined

  const handle = await installation.sync({ observer })
  const result = await handle.completion()

  renderer?.finish()

  const lines = [
    `Sync ${result.status} in ${result.duration}ms`,
    `  Tasks completed: ${result.tasksCompleted}`,
    `  Tasks failed:    ${result.tasksFailed}`,
  ]
  return lines.join('\n')
}
