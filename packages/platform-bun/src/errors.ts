/**
 * Bun platform error definitions.
 *
 * Errors specific to the Bun platform — filesystem projects, daemon management, etc.
 */

import { BadInput, ErrFacet, MaxError, NotFound } from "@max/core";

const BunPlatformBoundary = MaxError.boundary('bun-platform')
const HasMaxProjectRoot = ErrFacet.data<{ maxProjectRoot: string }>('HasMaxProjectRoot')

/** Already inside a Max project — use --force to create a nested project */
export const ErrCannotInitialiseProject = BunPlatformBoundary.define('cannot_initialise_project', {
  facets: [BadInput, HasMaxProjectRoot],
  message: () => `Cannot initialise Max project`,
})

/** No .max directory found — not a Max project */
export const ErrProjectNotInitialised = BunPlatformBoundary.define('project_not_initialised', {
  facets: [NotFound, HasMaxProjectRoot],
  message: (d) => `Not a Max project — no .max directory found at ${d.maxProjectRoot}`,
})

/** Daemon is disabled */
export const ErrDaemonDisabled = BunPlatformBoundary.define("daemon_disabled", {
  customProps: ErrFacet.props<{}>(),
  facets: [BadInput],
  message: () => `Daemon is disabled — run 'max daemon enable' first`,
})
