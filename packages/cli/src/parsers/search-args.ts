/**
 * Helpers for parsing search command option values.
 */

/** Parse "field:dir" ordering string. */
export function parseOrderBy(input: string): { field: string; dir: 'asc' | 'desc' } {
  const [field, dir] = input.split(':')
  const direction = dir?.toLowerCase()
  return {
    field,
    dir: direction === 'desc' ? 'desc' : 'asc',
  }
}

/** Parse comma-separated field list. */
export function parseFieldList(input: string): string[] {
  return input.split(',').map(f => f.trim()).filter(Boolean)
}
