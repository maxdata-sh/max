import { command, constant } from '@optique/core/primitives'
import {group, object, or } from '@optique/core/constructs'
import { message } from '@optique/core/message'

export const daemonCommand = command(
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
)
