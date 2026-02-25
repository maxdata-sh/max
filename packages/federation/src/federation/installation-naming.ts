/**
 * Installation Naming — Derives human-friendly slugs from connector identifiers.
 *
 * Connector names come in two forms:
 *   - Scoped:  "@max/connector-linear"
 *   - Bare:    "acme"
 *
 * This module strips the scope/prefix and appends an incrementing counter
 * to produce unique, filesystem-safe installation names like "linear-1".
 */

/**
 * Derive a unique installation slug from a connector identifier.
 *
 * @param connector - e.g. "@max/connector-linear" or "acme"
 * @param existingNames - names already taken in this workspace
 * @returns e.g. "linear-1", "acme-2"
 */
export function deriveInstallationSlug(connector: string, existingNames: string[]): string {
  const base = extractBaseSlug(connector)
  const taken = new Set(existingNames)

  let counter = 1
  while (taken.has(`${base}-${counter}`)) {
    counter++
  }

  return `${base}-${counter}`
}

/**
 * Extract a base slug from a connector identifier.
 *
 * "@max/connector-linear"  → "linear"
 * "@acme/connector-foo"    → "foo"
 * "acme"                   → "acme"
 */
function extractBaseSlug(connector: string): string {
  // Scoped: @scope/connector-name
  const match = connector.match(/^@[^/]+\/connector-(.+)$/)
  if (match) return match[1]

  // Bare name — use as-is
  return connector
}
