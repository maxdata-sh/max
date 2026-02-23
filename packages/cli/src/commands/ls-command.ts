import { LazyX } from '@max/core'
import { command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'
import { LsGlobalPrinter, LsWorkspacePrinter } from '../printers/context-printers.js'

// ============================================================================
// ls at global level — list workspaces
// ============================================================================

export class CmdLsGlobal implements Command {
  readonly name = 'ls'
  readonly level = 'global' as const

  constructor(private services: CliServices<'global'>) {}

  parser = LazyX.once(() => command(
    'ls',
    object({ cmd: constant('ls') }),
    { description: message`List children of current context` }
  ))

  async run(_args: Inferred<this>, opts: CommandOptions) {
    const ctx = this.services.ctx
    const workspaces = await ctx.global.listWorkspacesFull()

    return this.services.getPrintFormatter(opts.color).printVia(LsGlobalPrinter, {
      url: ctx.url,
      workspaces,
    })
  }
}

// ============================================================================
// ls at workspace level — list installations
// ============================================================================

export class CmdLsWorkspace implements Command {
  readonly name = 'ls'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'ls',
    object({ cmd: constant('ls') }),
    { description: message`List installations in this workspace` }
  ))

  async run(_args: Inferred<this>, opts: CommandOptions) {
    const ctx = this.services.ctx
    const infos = await ctx.workspace.listInstallations()

    const installations = await Promise.all(
      infos.map(async (inst) => {
        let health
        try {
          health = await ctx.workspace.installation(inst.id).health()
        } catch {
          health = { status: 'unhealthy' as const, reason: 'unreachable' }
        }
        return { name: inst.name, health }
      })
    )

    return this.services.getPrintFormatter(opts.color).printVia(LsWorkspacePrinter, {
      url: ctx.url,
      installations,
    })
  }
}
