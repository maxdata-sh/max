import { LazyX } from '@max/core'
import { command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'
import {
  StatusGlobalPrinter,
  StatusWorkspacePrinter,
  StatusInstallationPrinter,
} from '../printers/context-printers.js'

// ============================================================================
// status at global level
// ============================================================================

export class CmdStatusGlobal implements Command {
  readonly name = 'status'
  readonly level = 'global' as const

  constructor(private services: CliServices<'global'>) {}

  parser = LazyX.once(() => command(
    'status',
    object({ cmd: constant('status') }),
    { description: message`Show status of current context` }
  ))

  async run(_args: Inferred<this>, opts: CommandOptions) {
    const ctx = this.services.ctx
    const [health, workspaces] = await Promise.all([
      ctx.global.health(),
      ctx.global.listWorkspacesFull(),
    ])

    return this.services.getPrintFormatter(opts.color).printVia(StatusGlobalPrinter, {
      url: ctx.url,
      health,
      workspaces,
    })
  }
}

// ============================================================================
// status at workspace level
// ============================================================================

export class CmdStatusWorkspace implements Command {
  readonly name = 'status'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'status',
    object({ cmd: constant('status') }),
    { description: message`Show status of this workspace` }
  ))

  async run(_args: Inferred<this>, opts: CommandOptions) {
    const ctx = this.services.ctx
    const [health, infos] = await Promise.all([
      ctx.workspace.health(),
      ctx.workspace.listInstallations(),
    ])

    const installations = await Promise.all(
      infos.map(async (inst) => {
        let instHealth
        try {
          instHealth = await ctx.workspace.installation(inst.id).health()
        } catch {
          instHealth = { status: 'unhealthy' as const, reason: 'unreachable' }
        }
        return { name: inst.name, connector: inst.connector as string, health: instHealth }
      })
    )

    return this.services.getPrintFormatter(opts.color).printVia(StatusWorkspacePrinter, {
      url: ctx.url,
      health,
      installations,
    })
  }
}

// ============================================================================
// status at installation level
// ============================================================================

export class CmdStatusInstallation implements Command {
  readonly name = 'status'
  readonly level = 'installation' as const

  constructor(private services: CliServices<'installation'>) {}

  parser = LazyX.once(() => command(
    'status',
    object({ cmd: constant('status') }),
    { description: message`Show status of this installation` }
  ))

  async run(_args: Inferred<this>, opts: CommandOptions) {
    const ctx = this.services.ctx
    const [health, description] = await Promise.all([
      ctx.installation.health(),
      ctx.installation.describe(),
    ])

    return this.services.getPrintFormatter(opts.color).printVia(StatusInstallationPrinter, {
      url: ctx.url,
      health,
      description,
    })
  }
}
