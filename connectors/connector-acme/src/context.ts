/**
 * AcmeContext - Context definition for Acme connector.
 */

import { Context } from "@max/core";
import type { AcmeClient } from "./acme-client.js";

export class AcmeAppContext extends Context {
  api = Context.instance<AcmeClient>();
  workspaceId = Context.string;
}
