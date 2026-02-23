/**
 * CLI error boundary — errors owned by the CLI dispatch layer.
 */

import { BadInput, ErrFacet, MaxError } from '@max/core'

export const CliBoundary = MaxError.boundary('cli')

/** Target string (from -t, env, or cwd) could not be resolved to a node. */
export const ErrTargetResolutionFailed = CliBoundary.define('target_resolution_failed', {
  customProps: ErrFacet.props<{ target: string; reason: string }>(),
  facets: [BadInput],
  message: (d) => `Cannot resolve target "${d.target}" — ${d.reason}`,
})

/** Command invoked at a level it doesn't support. */
export const ErrCommandNotAtLevel = CliBoundary.define('command_not_at_level', {
  customProps: ErrFacet.props<{ command: string; level: string; url: string; supportedLevels: string[] }>(),
  facets: [BadInput],
  message: (d) =>
    `"${d.command}" is not available at ${d.level} level.\n  Supported levels: ${d.supportedLevels.join(', ')}\n  Current context: ${d.url}\n  Hint: max -t <${d.supportedLevels[0]}> ${d.command}`,
})


/** No command matched the first positional argument. */
export const ErrUnknownCommand = CliBoundary.define('unknown_command', {
  customProps: ErrFacet.props<{ command: string }>(),
  facets: [BadInput],
  message: (d) => `Unknown command "${d.command}"`,
})
