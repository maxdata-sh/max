/**
 * CliServices — per-request DI container for command classes.
 *
 * Parameterized by level so commands get type-safe access to context
 * clients. A CmdSchemaWorkspace takes CliServices<'workspace'> and
 * can access services.ctx.workspace without assertions.
 *
 * Completers are lazily created on first access — only commands that
 * need them (workspace+ level) trigger construction.
 */

import { ErrInvariant } from '@max/federation'
import  { makeLazy, MaxUrlLevel } from '@max/core'
import { Fmt, PrintFormatter, Schema } from '@max/core'
import { BunPlatform } from '@max/platform-bun'
import { SchemaPrinters } from './printers/schema-printers.js'
import { ProjectCompleters } from './parsers/project-completers.js'
import { CLIAnyContext, ContextAt } from './resolved-context.js'

export class CliServices<L extends MaxUrlLevel = MaxUrlLevel> {
  private colorPrinter: PrintFormatter
  private plainPrinter: PrintFormatter

  constructor(readonly ctx: ContextAt<L>, readonly useColor: boolean) {
    this.colorPrinter = new PrintFormatter(Fmt.ansi, BunPlatform.printers)
    this.plainPrinter = new PrintFormatter(Fmt.plain, BunPlatform.printers)
  }

  lazy = makeLazy({
    completers: () => {
      return new ProjectCompleters(
        makeLazy({ workspace: () => {
            const ctx = this.ctx as CLIAnyContext
            if (ctx.level === 'workspace' || ctx.level === 'installation'){
              return ctx.workspace
            }else{
              throw ErrInvariant.create({
                detail:
                  'Max attempted to build ProjectCompleters for a non-project context. This is unexpected',
              })
            }
        }}),
        Fmt.usingColor(this.useColor)
      )
    }
  })

  /** Lazily created — only meaningful at workspace+ levels. */
  get completers(): ProjectCompleters {
    return this.lazy.completers
  }

  getPrintFormatter(color: boolean): PrintFormatter {
    return color ? this.colorPrinter : this.plainPrinter
  }

  formatSchema(schema: Schema, output: string | undefined, color: boolean): string {
    const printer = this.getPrintFormatter(color)
    switch (output) {
      case 'json':   return printer.printVia(SchemaPrinters.SchemaJson, schema)
      case 'ndjson': return printer.printVia(SchemaPrinters.SchemaJsonl, schema)
      default:       return printer.printVia(SchemaPrinters.SchemaText, schema)
    }
  }

  /** Look up the workspace's dataDir from its registration config. */
  async getWorkspaceDataDir(): Promise<string> {
    const workspaces = await this.ctx.global.listWorkspaces()
    const ws = workspaces.find(w => w.name === this.ctx.url.workspace)
    if (!ws) {
      throw ErrInvariant.create({ detail: `Workspace "${this.ctx.url.workspace}" not found in registry` })
    }
    return (ws.config as Record<string, unknown>).dataDir as string
  }
}
