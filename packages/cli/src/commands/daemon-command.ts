import { LazyX } from '@max/core'
import { command, constant } from '@optique/core/primitives'
import { object, or } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { ErrInvariant } from '@max/federation'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'

export class CmdDaemon implements Command {
  readonly name = 'daemon'
  readonly level = ['global', 'workspace', 'installation'] as const

  constructor(private services: CliServices<'global'> | CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'daemon',
    object({
      cmd: constant('daemon'),
      sub: or(
        command('status', constant('status'), {
          brief: message`Show daemon status`,
        }),
        command('start', constant('start'), {
          brief: message`Start the background daemon`,
        }),
        command('restart', constant('restart'), {
          brief: message`Restart the background daemon`,
        }),
        command('stop', constant('stop'), {
          brief: message`Stop the background daemon`,
        }),
        command('enable', constant('enable'), {
          brief: message`Enable daemon auto-start`,
        }),
        command('disable', constant('disable'), {
          brief: message`Disable daemon and stop if running`,
        }),
        command('list', constant('list'), {
          brief: message`List all known project daemons`,
        })
      ),
    }),
    {
      description: message`Manage the background daemon process`,
    }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    switch (args.sub) {
      case 'list': {
        const printer = this.services.getPrintFormatter(opts.color)
        const w = await this.services.ctx.global.listWorkspacesFull()
        return printer.printList("workspace-list-entry", w)
      }
    }

    throw ErrInvariant.create({
      detail: `Daemon commands are temporarily unavailable during federation migration`,
    })
  }
}
