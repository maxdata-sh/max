import { BadInput, ErrFacet, MaxError, NotFound } from '@max/core'

export const CLIBoundary = MaxError.boundary("cli")

export const ErrMissingParam = CLIBoundary.define('missing_param', {
  customProps: ErrFacet.props<{ param: string }>(),
  facets: [BadInput],
  message: (d) => `Missing required parameter: ${d.param}`,
})

export const ErrInvalidParam = CLIBoundary.define('invalid_param', {
  customProps: ErrFacet.props<{ param: string; value: string }>(),
  facets: [BadInput],
  message: (d) => `Invalid value for '${d.param}': ${d.value}`,
})

export const ErrUnknownCommand = CLIBoundary.define('unknown_command', {
  customProps: ErrFacet.props<{ command: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown command: ${d.command}`,
})
