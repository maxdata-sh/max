import {BadInput, ErrFacet, MaxError, NotFound, NotSupported, InvariantViolated} from "@max/core";

const AppBoundary = MaxError.boundary("app");

export const ErrConnectorNotFound = AppBoundary.define("connector_not_found", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown connector: ${d.connector}`,
});

export const ErrWorkspaceHandleNotFound = AppBoundary.define('workspace_handle_not_found', {
  customProps: ErrFacet.props<{ workspace: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown workspace`,
})

export const ErrInstallationHandleNotFound = AppBoundary.define('installation_handle_not_found', {
  customProps: ErrFacet.props<{ installation: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown installation ${d.installation}`,
})

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

export const ErrConnectNotSupported = AppBoundary.define("connect_not_supported", {
  customProps: ErrFacet.props<{ providerKind: string }>(),
  facets: [NotSupported],
  message: (d) => `Provider "${d.providerKind}" does not support connect()`,
});

export const ErrProviderNotFound = AppBoundary.define("provider_not_found", {
  customProps: ErrFacet.props<{ hostingType: string }>(),
  facets: [NotFound],
  message: (d) => `No provider registered for hosting type: ${d.hostingType}`,
});

