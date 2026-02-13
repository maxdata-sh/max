import { MaxError, ErrFacet, BadInput, NotFound } from "@max/core";

export const Daemon = MaxError.boundary("daemon");

export const ErrMissingParam = Daemon.define("missing_param", {
  customProps: ErrFacet.props<{ param: string }>(),
  facets: [BadInput],
  message: (d) => `Missing required parameter: ${d.param}`,
});

export const ErrInvalidParam = Daemon.define("invalid_param", {
  customProps: ErrFacet.props<{ param: string; value: string }>(),
  facets: [BadInput],
  message: (d) => `Invalid value for '${d.param}': ${d.value}`,
});

export const ErrUnknownCommand = Daemon.define("unknown_command", {
  customProps: ErrFacet.props<{ command: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown command: ${d.command}`,
});

export const ErrConnectorNotFound = Daemon.define("connector_not_found", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [NotFound],
  message: (d) => `Unknown connector: ${d.connector}`,
});

export const ErrNoOnboarding = Daemon.define("no_onboarding", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [BadInput],
  message: (d) => `Connector "${d.connector}" does not define an onboarding flow`,
});
