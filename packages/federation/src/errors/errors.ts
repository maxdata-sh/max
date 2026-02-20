import {BadInput, ErrFacet, HasConnector, MaxError, NotFound, NotSupported, NotImplemented, InvariantViolated} from "@max/core";
import type { ConnectorType } from "@max/core";

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
  customProps: ErrFacet.props<{ hostingStrategy: string }>(),
  facets: [NotFound],
  message: (d) => `No provider registered for hosting strategy: ${d.hostingStrategy}`,
});

export const ErrUnsupportedConfig = AppBoundary.define("unsupported_config", {
  customProps: ErrFacet.props<{ kind: string; configType: string }>(),
  facets: [NotImplemented],
  message: (d) => `${d.kind} type "${d.configType}" is not yet supported`,
});

/** An installation with this connector:slug already exists */
export const ErrInstallationAlreadyExists = AppBoundary.define('installation_already_exists', {
  customProps: ErrFacet.props<{ connector: ConnectorType; name: string }>(),
  facets: [BadInput, HasConnector],
  message: (d) => `Installation "${d.connector}:${d.name}" already exists`,
})

