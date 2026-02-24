/**
 * Printers for search command output.
 *
 * Three output modes: text (human-readable table), json, ndjson.
 * All printers respect optional field selection — when selectedFields
 * is provided, only those fields appear in output.
 */

import type { EntityDefAny, EntityResult, Page } from '@max/core'
import { Printer } from '@max/core'

export interface SearchView {
  entityType: string
  page: Page<EntityResult<EntityDefAny, string>>
  selectedFields?: string[]
}

/** Pick fields to display: user selection if provided, otherwise all loaded fields. */
function resolveFields(view: SearchView): string[] {
  if (view.selectedFields) return view.selectedFields
  const fieldSet = new Set<string>()
  for (const item of view.page.items) {
    for (const f of item.loadedFields()) fieldSet.add(f)
  }
  return Array.from(fieldSet)
}

/** Convert an entity result to a plain object filtered by fields. */
function pickFields(item: EntityResult<EntityDefAny, string>, fields: string[]): Record<string, unknown> {
  const obj = item.toObject() as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const f of fields) {
    if (f in obj) picked[f] = obj[f]
  }
  return picked
}

// ============================================================================
// Text — tabular output with pagination hint
// ============================================================================

export const SearchTextPrinter = Printer.define<SearchView>((view, fmt) => {
  const { page, entityType } = view
  const lines: string[] = []

  // Header
  const count = page.items.length
  const more = page.hasMore ? ', more available' : ''
  lines.push(`${fmt.underline(entityType)}: ${count} result${count !== 1 ? 's' : ''}${more}`)
  lines.push('')

  if (count === 0) {
    lines.push('  No results.')
    return Printer.lines(lines)
  }

  const fields = resolveFields(view)

  // Build rows
  const rows = page.items.map(item => {
    const obj = pickFields(item, fields)
    return fields.map(f => String(obj[f] ?? ''))
  })

  // Column widths
  const widths = fields.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length))
  )

  // Header row
  lines.push('  ' + fields.map((h, i) => fmt.dim(h.padEnd(widths[i]))).join('  '))

  // Data rows
  for (const row of rows) {
    lines.push('  ' + row.map((c, i) => c.padEnd(widths[i])).join('  '))
  }

  // Pagination hint
  if (page.hasMore && page.cursor) {
    lines.push('')
    lines.push(fmt.dim(`Next page: --after ${page.cursor}`))
  }

  return Printer.lines(lines)
})

// ============================================================================
// JSON — single object with pagination metadata
// ============================================================================

export const SearchJsonPrinter = Printer.define<SearchView>((view, _fmt) => {
  const fields = resolveFields(view)
  const data = view.page.items.map(item => pickFields(item, fields))
  const result: Record<string, unknown> = {
    type: view.entityType,
    data,
    hasMore: view.page.hasMore,
  }
  if (view.page.cursor) result.cursor = view.page.cursor
  return JSON.stringify(result, null, 2)
})

// ============================================================================
// NDJSON — one line per entity, metadata as final line
// ============================================================================

export const SearchNdjsonPrinter = Printer.define<SearchView>((view, _fmt) => {
  const fields = resolveFields(view)
  const lines: string[] = []
  for (const item of view.page.items) {
    lines.push(JSON.stringify(pickFields(item, fields)))
  }
  lines.push(JSON.stringify({
    _meta: {
      type: view.entityType,
      hasMore: view.page.hasMore,
      cursor: view.page.cursor,
    }
  }))
  return lines.join('\n')
})
