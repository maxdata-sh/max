/**
 * @max/connector-acme - Acme connector backed by the real @max/acme API
 */

import {AcmeProjectResolver} from "./resolvers/project-resolver.js";

export { AcmeRoot, AcmeUser, AcmeWorkspace, AcmeProject, AcmeTask } from "./entities.js";
export { AcmeAppContext } from "./context.js";
export { AcmeClient } from "./acme-client.js";
export { AcmeRootResolver, RootWorkspacesLoader } from "./resolvers/root-resolver.js";
export { AcmeUserResolver, UserBasicLoader } from "./resolvers/user-resolver.js";
export { AcmeWorkspaceResolver, WorkspaceBasicLoader, WorkspaceUsersLoader, WorkspaceProjectsLoader } from "./resolvers/workspace-resolver.js";
export { AcmeSeeder } from "./seeder.js";
export { AcmeSchema } from "./schema.js";
export { AcmeApiToken } from "./credentials.js";
export { AcmeOnboarding } from "./onboarding.js";
export type { AcmeConfig } from "./config.js";

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

import { Context } from "@max/core";
import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { AcmeSchema } from "./schema.js";
import { AcmeSeeder } from "./seeder.js";
import { AcmeUserResolver } from "./resolvers/user-resolver.js";
import { AcmeWorkspaceResolver } from "./resolvers/workspace-resolver.js";
import { AcmeRootResolver } from "./resolvers/root-resolver.js";
import { AcmeOnboarding } from "./onboarding.js";
import { AcmeAppContext } from "./context.js";
import { AcmeClient } from "./acme-client.js";
import { AcmeApiToken } from "./credentials.js";
import type { AcmeConfig } from "./config.js";

const AcmeDef = ConnectorDef.create<AcmeConfig>({
  name: "acme",
  displayName: "Acme",
  description: "Project management connector powered by Acme",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: AcmeSchema,
  onboarding: AcmeOnboarding,
  seeder: AcmeSeeder,
  resolvers: [
    AcmeRootResolver,
    AcmeUserResolver,
    AcmeWorkspaceResolver,
    AcmeProjectResolver
  ],
});

const AcmeConnector = ConnectorModule.create<AcmeConfig>({
  def: AcmeDef,
  initialise(config, credentials) {
    const tokenHandle = credentials.get(AcmeApiToken);
    const api = new AcmeClient(config, tokenHandle);

    const ctx = Context.build(AcmeAppContext, {
      api,
      workspaceId: config.workspaceId,
    });

    return Installation.create({
      context: ctx,
      async start() {
        await api.start();
        credentials.startRefreshSchedulers();
      },
      async stop() {
        credentials.stopRefreshSchedulers();
      },
      async health() {
        const result = await api.health();
        return result.ok
          ? { status: "healthy" }
          : { status: "unhealthy", reason: result.error ?? "Unknown error" };
      },
    });
  },
});

export default AcmeConnector
