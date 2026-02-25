/**
 * Error boundary for the query parser.
 */

import { BadInput, ErrFacet, MaxError } from '@max/core'

const QueryParserBoundary = MaxError.boundary('query-parser')

/** The filter expression could not be parsed. */
export const ErrQueryParse = QueryParserBoundary.define('parse_failed', {
  customProps: ErrFacet.props<{ expression: string; reason: string; index: number }>(),
  facets: [BadInput],
  message: (d) => `Invalid filter "${d.expression}" — ${d.reason} (at position ${d.index})`,
})

/** OR is not yet supported by the query engine. */
export const ErrOrNotSupported = QueryParserBoundary.define('or_not_supported', {
  customProps: ErrFacet.props<{ expression: string }>(),
  facets: [BadInput],
  message: (d) => `OR is not yet supported in filters — "${d.expression}"`,
})
