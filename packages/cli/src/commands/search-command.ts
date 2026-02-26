/**
 * search — query entities from an installation's engine.
 *
 * Supports filtering, field selection, ordering, and cursor pagination.
 * Output in text (table), JSON, or NDJSON formats.
 *
 * Constructs the EntityQuery descriptor directly (rather than via the typed
 * QueryBuilder) because CLI inputs are runtime strings — the typed builder's
 * generic constraints don't help at this boundary.
 */

import { LazyX, Projection, WhereClause } from '@max/core'
import type { EntityQuery, AllProjection, QueryOrdering } from '@max/core'
import { command, constant, argument, option } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { optional } from '@optique/core/modifiers'
import { string, integer } from '@optique/core/valueparser'
import { message } from '@optique/core/message'
import { outputOption } from '../parsers/standard-opts.js'
import { parseFilter } from '../parsers/filter-parser.js'
import { parseOrderBy, parseFieldList } from '../parsers/search-args.js'
import { ErrUnknownEntityType } from '../errors.js'
import { SearchTextPrinter, SearchJsonPrinter, SearchNdjsonPrinter } from '../printers/search-printers.js'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'

export class CmdSearchInstallation implements Command {
  readonly name = 'search'
  readonly level = 'installation' as const

  constructor(private services: CliServices<'installation'>) {}

  parser = LazyX.once(() => command(
    'search',
    object({
      cmd: constant('search'),
      entityType: argument(string(), {
        description: message`Entity type to search`,
      }),
      filter:  optional(option('-f', '--filter', string(), { description: message`Filter expression (e.g. "name=Acme AND active=true")` })),
      limit:   optional(option('--limit', integer(), { description: message`Max results (default: 50)` })),
      after:   optional(option('--after', string(), { description: message`Cursor for next page` })),
      orderBy: optional(option('--order-by', string(), { description: message`Sort field (e.g. "name:desc")` })),
      fields:  optional(option('--fields', string(), { description: message`Comma-separated fields to select` })),
      output:  outputOption,
    }),
    { description: message`Search entities` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const ctx = this.services.ctx
    const schema = await ctx.installation.schema()

    // Resolve entity type
    const def = schema.getDefinition(args.entityType)
    if (!def) {
      throw ErrUnknownEntityType.create({
        entityType: args.entityType,
        available: [...schema.entityTypes],
      })
    }

    const validFields = Object.keys(def.fields)

    // Build filters from user input
    const filters = args.filter
      ? parseFilter(args.filter, validFields)
      : WhereClause.empty

    // Build ordering
    let ordering: QueryOrdering | undefined
    if (args.orderBy) {
      ordering = parseOrderBy(args.orderBy)
    }

    // Construct EntityQuery descriptor directly — CLI inputs are runtime
    // strings, so the typed builder's generics don't apply here. We always
    // use AllProjection and let the printer handle field selection.
    const query: EntityQuery<typeof def, AllProjection> = {
      def,
      filters,
      ordering,
      limit: args.limit ?? 50,
      cursor: args.after,
      projection: Projection.all,
    }

    // FIXME: This is a footgun. We need to start the installation before we can access the engine. Instead, engine should just be awaitable.
    await ctx.installation.start()
    const page = await ctx.installation.engine.query(query)

    // Format output (field filtering handled by printers)
    const printer = this.services.getPrintFormatter(opts.color)
    const selectedFields = args.fields ? parseFieldList(args.fields) : undefined
    const view = { entityType: args.entityType, page, selectedFields }

    switch (args.output) {
      case 'json':   return printer.printVia(SearchJsonPrinter, view)
      case 'ndjson': return printer.printVia(SearchNdjsonPrinter, view)
      default:       return printer.printVia(SearchTextPrinter, view)
    }
  }
}
