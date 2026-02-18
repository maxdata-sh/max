/**
 * Error definitions for the registry boundary.
 */

import { MaxError, ErrFacet, NotFound, BadInput } from '@max/core'
import type { InstallationId } from '@max/core'

// ============================================================================
// Registry Boundary
// ============================================================================

export const Registry = MaxError.boundary('registry')

// ============================================================================
// Error Definitions
// ============================================================================

/** Registry entry not found for the given installation ID */
export const ErrRegistryEntryNotFound = Registry.define('entry_not_found', {
  customProps: ErrFacet.props<{ id: InstallationId }>(),
  facets: [NotFound],
  message: (d) => `Registry entry not found for installation "${d.id}"`,
})

/** A registry entry with this name already exists */
export const ErrRegistryEntryAlreadyExists = Registry.define('entry_already_exists', {
  customProps: ErrFacet.props<{ name: string }>(),
  facets: [BadInput],
  message: (d) => `Registry entry "${d.name}" already exists`,
})
