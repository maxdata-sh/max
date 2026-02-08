/**
 * AcmeContext - Context definition for Acme connector.
 */

import {Context} from "@max/core";
import {AcmeApiClient} from "./acme-client.js";

/**
 * AcmeAppContext - Application-level context for Acme loaders.
 */
export class AcmeAppContext extends Context {
  api = Context.instance<AcmeApiClient>();
  installationId = Context.string;
}
