/**
 * Error definitions for the project boundary.
 */

import { MaxError, ErrFacet, NotFound, BadInput, HasConnector } from "@max/core";
import type { ConnectorType } from "@max/core";

// ============================================================================
// Project Boundary
// ============================================================================

export const Project = MaxError.boundary("project");

// ============================================================================
// Error Definitions
// ============================================================================

/** Installation not found for the given connector/slug */
export const ErrInstallationNotFound = Project.define("installation_not_found", {
  customProps: ErrFacet.props<{ connector: ConnectorType; name?: string }>(),
  facets: [NotFound, HasConnector],
  message: (d) =>
    d.name
      ? `Installation "${d.connector}:${d.name}" not found`
      : `No installation found for connector "${d.connector}"`,
});

/** An installation with this connector:slug already exists */
export const ErrInstallationAlreadyExists = Project.define("installation_already_exists", {
  customProps: ErrFacet.props<{ connector: ConnectorType; name: string }>(),
  facets: [BadInput, HasConnector],
  message: (d) => `Installation "${d.connector}:${d.name}" already exists`,
});

/** No .max directory found — not a Max project */
export const ErrProjectNotInitialised = Project.define("project_not_initialised", {
  customProps: ErrFacet.props<{ path: string}>(),
  facets: [NotFound],
  message: (d) => `Not a Max project — no .max directory found at ${d.path}}`,
});
