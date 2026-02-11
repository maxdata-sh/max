/**
 * Error definitions for the connector boundary.
 */

import {MaxError, ErrFacet, NotFound, BadInput, InvariantViolated, HasConnector, NotSupported} from "@max/core";
import {ErrCollectionNotSupported} from "@max/storage-sqlite";

// ============================================================================
// Connector Boundary
// ============================================================================

export const Connector = MaxError.boundary("connector");

// ============================================================================
// Error Definitions
// ============================================================================

/** Credential not found in store */
export const ErrCredentialNotFound = Connector.define("credential_not_found", {
  customProps: ErrFacet.props<{ credential: string }>(),
  facets: [NotFound],
  message: (d) => `Credential "${d.credential}" not found`,
});

/** OAuth credential not registered with provider */
export const ErrOAuthNotRegistered = Connector.define("oauth_not_registered", {
  customProps: ErrFacet.props<{ accessToken: string }>(),
  facets: [BadInput],
  message: (d) => `No OAuth credential registered for access token "${d.accessToken}"`,
});

/** Unknown credential ref kind — invariant violation */
export const ErrUnknownCredentialRef = Connector.define("unknown_credential_ref", {
  customProps: ErrFacet.props<{ kind: string }>(),
  facets: [InvariantViolated],
  message: (d) => `Unknown credential ref kind: ${d.kind}`,
});

/** Connector not found in registry */
export const ErrConnectorNotFound = Connector.define("connector_not_found", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [NotFound, HasConnector],
  message: (d) => `Connector "${d.connector}" not found in registry`,
});

/** Connector already registered */
export const ErrConnectorAlreadyRegistered = Connector.define("connector_already_registered", {
  customProps: ErrFacet.props<{ connector: string }>(),
  facets: [BadInput, HasConnector],
  message: (d) => `Connector "${d.connector}" is already registered`,
});

/** addLocal not supported — use addLocalNamed */
export const ErrAddLocalNotSupported = Connector.define("add_local_not_supported", {
  facets: [BadInput, NotSupported],
  message: () => `addLocal() requires loading the module to discover its name — use addLocalNamed(name, loader) instead`,
});
