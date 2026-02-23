import { LazyX } from '@max/core'
import { argument, command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core'
import { message } from '@optique/core/message'
import { path } from '@optique/run'
import { BunPlatform, ErrCannotInitialiseProject, findProjectRoot } from '@max/platform-bun'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'
import * as nodePath from 'node:path'

export class CmdInit implements Command {
  readonly name = 'init'
  readonly level = ['global', 'workspace'] as const

  constructor(private services: CliServices<'global'> | CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'init',
    object({
      cmd: constant('init'),
      force: withDefault(
        flag('-f', '--force', { description: message`Force creation of project` }),
        false
      ),
      directory: argument(path({ mustExist: true, type: 'directory' }), {
        description: message`Directory to initialize`,
      }),
    }),
    { description: message`Initialize a new Max project` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const dir = nodePath.resolve(args.directory)
    const existingRoot = findProjectRoot(dir)

    if (existingRoot && !args.force) {
      throw ErrCannotInitialiseProject.create(
        { maxProjectRoot: existingRoot },
        'you are already in a max project! Use `force=true` to create one here anyway.'
      )
    }

    await this.services.ctx.global.createWorkspace(nodePath.basename(dir), {
      via: BunPlatform.workspace.deploy.inProcess,
      config: { strategy: 'in-process', dataDir: nodePath.join(dir, '.max') },
      spec: { name: nodePath.basename(dir) },
    })
    return ''
  }
}
