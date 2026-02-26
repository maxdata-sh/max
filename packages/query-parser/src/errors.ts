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

