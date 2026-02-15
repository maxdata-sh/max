import {ErrFacet, MaxError, NotFound} from "@max/core";

const AppBoundary = MaxError.boundary("app");

export const ErrConnectorNotFound = AppBoundary.define("connector_not_found", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown connector: ${d.connector}`,
});
