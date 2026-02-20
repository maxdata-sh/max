/**
 * Error definitions for the registry boundary.
 */

import { MaxError, ErrFacet, NotFound, BadInput } from '@max/core'

// ============================================================================
// Registry Boundary
// ============================================================================

export const Registry = MaxError.boundary('registry')

// ============================================================================
// Error Definitions
// ============================================================================

/** Registry entry not found for the given ID */
export const ErrRegistryEntryNotFound = Registry.define('entry_not_found', {
  customProps: ErrFacet.props<{ registry: string; id: string }>(),
  facets: [NotFound],
  message: (d) => `${d.registry} registry entry not found: "${d.id}"`,
})

/** A registry entry with this name already exists */
export const ErrRegistryEntryAlreadyExists = Registry.define('entry_already_exists', {
  customProps: ErrFacet.props<{ name: string }>(),
  facets: [BadInput],
  message: (d) => `Registry entry "${d.name}" already exists`,
})
