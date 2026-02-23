import { LazyX } from '@max/core'
import { argument, command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { outputOption } from '../parsers/standard-opts.js'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'

export class CmdSchemaWorkspace implements Command {
  readonly name = 'schema'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'schema',
    object({
      cmd: constant('schema'),
      source: argument(this.services.completers.connectorSource, {
        description: message`Source to show schema for`,
      }),
      output: outputOption,
    }),
    { description: message`Display the entity schema for a source` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const schema = await this.services.ctx.workspace.connectorSchema(args.source)
    return this.services.formatSchema(schema, args.output, opts.color)
  }
}

export class CmdSchemaInstallation implements Command {
  readonly name = 'schema'
  readonly level = 'installation' as const

  constructor(private services: CliServices<'installation'>) {}

  parser = LazyX.once(() => command(
    'schema',
    object({
      cmd: constant('schema'),
      output: outputOption,
    }),
    { description: message`Display the entity schema` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const schema = await this.services.ctx.installation.schema()
    return this.services.formatSchema(schema, args.output, opts.color)
  }
}
