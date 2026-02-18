import {BadInput, ErrFacet, MaxError, NotFound, InvariantViolated} from "@max/core";

const AppBoundary = MaxError.boundary("app");

export const ErrConnectorNotFound = AppBoundary.define("connector_not_found", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown connector: ${d.connector}`,
});

export const ErrNoOnboarding = AppBoundary.define("no_onboarding", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [BadInput],
  message: (d) => `Connector "${d.connector}" does not define an onboarding flow`,
});

export const ErrDaemonDisabled = AppBoundary.define("daemon_disabled", {
  customProps: ErrFacet.props<{}>(),
  facets: [BadInput],
  message: () => `Daemon is disabled — run 'max daemon enable' first`,
});

export const ErrInvariant = AppBoundary.define("invariant", {
  customProps: ErrFacet.props<{ detail: string }>(),
  facets: [InvariantViolated],
  message: (d) => `Invariant violation: ${d.detail}`,
});
