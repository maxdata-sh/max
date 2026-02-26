/**
 * search — query entities from an installation's engine.
 *
 * Three variants:
 *   CmdSearchGlobal        — `max -g search <workspace/installation> <entity> [opts]`
 *   CmdSearchWorkspace     — `max search <installation> <entity> [opts]`
 *   CmdSearchInstallation  — `max search <entity> [opts]` (when targeted via -t)
 *
 * Supports filtering, field selection, ordering, and cursor pagination.
 * Output in text (table), JSON, or NDJSON formats.
 */

import { LazyX, Projection, WhereClause, PrintFormatter } from '@max/core'
import type { EntityQuery, AllProjection, QueryOrdering, InstallationId } from '@max/core'
import type { InstallationClient } from '@max/federation'
import { ErrInstallationNotFound } from '@max/federation'
import { command, constant, argument, option } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { optional } from '@optique/core/modifiers'
import { string, integer } from '@optique/core/valueparser'
import type { ValueParser } from '@optique/core/valueparser'
import { message } from '@optique/core/message'
import { outputOption } from '../parsers/standard-opts.js'
import { parseFilter } from '../parsers/filter-parser.js'
import { parseOrderBy, parseFieldList } from '../parsers/search-args.js'
import { ErrUnknownEntityType, ErrTargetResolutionFailed } from '../errors.js'
import { SearchTextPrinter, SearchJsonPrinter, SearchNdjsonPrinter } from '../printers/search-printers.js'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'
import type { ResolvedContext } from '../resolved-context.js'

// ============================================================================
// Search options shared by both variants
// ============================================================================

const searchOptions = {
  filter:  optional(option('-f', '--filter', string(), { description: message`Filter expression (e.g. "name=Acme AND active=true")` })),
  limit:   optional(option('--limit', integer(), { description: message`Maximum page size` })),
  after:   optional(option('--after', string(), { description: message`Cursor for next page` })),
  orderBy: optional(option('--order-by', string(), { description: message`Sort field (e.g. "name:desc")` })),
  fields:  optional(option('--fields', string(), { description: message`Comma-separated fields to select` })),
  output:  outputOption,
}

type SearchArgs = {
  entityType: string
  filter?: string
  limit?: number
  after?: string
  orderBy?: string
  fields?: string
  output?: string
}

// ============================================================================
// Global variant — `max -g search <workspace/installation> <entity> [opts]`
// ============================================================================

export class CmdSearchGlobal implements Command {
  readonly name = 'search'
  readonly level = 'global' as const

  constructor(
    private services: CliServices<'global'>,
    private targetVP: ValueParser<'async', ResolvedContext>,
  ) {}

  parser = LazyX.once(() => command(
    'search',
    object({
      cmd: constant('search'),
      target: argument(this.targetVP, {
        description: message`Target installation (workspace/installation)`,
      }),
      entityType: argument(string(), {
        description: message`Entity type to search`,
      }),
      ...searchOptions,
    }),
    { description: message`Search entities in a target installation` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const resolved = args.target
    if (resolved.level !== 'installation') {
      throw ErrTargetResolutionFailed.create({
        target: resolved.url.toString(),
        reason: `Expected an installation target (workspace/installation), got ${resolved.level}`,
      })
    }
    return runSearch(resolved.installation, args, this.services.getPrintFormatter(opts.color))
  }
}

// ============================================================================
// Workspace variant — `max search <installation> <entity> [opts]`
// ============================================================================

export class CmdSearchWorkspace implements Command {
  readonly name = 'search'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'search',
    object({
      cmd: constant('search'),
      installation: argument(this.services.completers.installationName, {
        description: message`Installation to search`,
      }),
      entityType: argument(this.services.completers.entityTypeName, {
        description: message`Entity type to search`,
      }),
      ...searchOptions,
    }),
    { description: message`Search entities` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const installations = await this.services.ctx.workspace.listInstallations()
    const match = installations.find(i => i.name === args.installation)
    if (!match) {
      throw ErrInstallationNotFound.create({ installation: args.installation })
    }
    const inst = this.services.ctx.workspace.installation(match.id)
    return runSearch(inst, args, this.services.getPrintFormatter(opts.color))
  }
}

// ============================================================================
// Installation variant — `max search <entity> [opts]`
// ============================================================================

export class CmdSearchInstallation implements Command {
  readonly name = 'search'
  readonly level = 'installation' as const

  constructor(private services: CliServices<'installation'>) {}

  parser = LazyX.once(() => command(
    'search',
    object({
      cmd: constant('search'),
      entityType: argument(this.services.completers.entityTypeName, {
        description: message`Entity type to search`,
      }),
      ...searchOptions,
    }),
    { description: message`Search entities` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    return runSearch(this.services.ctx.installation, args, this.services.getPrintFormatter(opts.color))
  }
}

// ============================================================================
// Shared search logic
// ============================================================================

async function runSearch(
  installation: InstallationClient,
  args: SearchArgs,
  printer: PrintFormatter,
): Promise<string> {
  const schema = await installation.schema()

  const def = schema.getDefinition(args.entityType)
  if (!def) {
    throw ErrUnknownEntityType.create({
      entityType: args.entityType,
      available: [...schema.entityTypes],
    })
  }

  const validFields = Object.keys(def.fields)
  const filters = args.filter ? parseFilter(args.filter, validFields) : WhereClause.empty

  let ordering: QueryOrdering | undefined
  if (args.orderBy) {
    ordering = parseOrderBy(args.orderBy)
  }

  const query: EntityQuery<typeof def, AllProjection> = {
    def,
    filters,
    ordering,
    limit: args.limit,
    cursor: args.after,
    projection: Projection.all,
  }

  // FIXME: This is a footgun. We need to start the installation before we can access the engine. Instead, engine should just be awaitable.
  await installation.start()
  const page = await installation.engine.query(query)

  const selectedFields = args.fields ? parseFieldList(args.fields) : undefined
  const view = { entityType: args.entityType, page, selectedFields }

  switch (args.output) {
    case 'json':   return printer.printVia(SearchJsonPrinter, view)
    case 'ndjson': return printer.printVia(SearchNdjsonPrinter, view)
    default:       return printer.printVia(SearchTextPrinter, view)
  }
}
