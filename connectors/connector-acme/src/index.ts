/**
 * @max/connector-acme - Test connector with dummy Acme entities
 */

export { AcmeRoot, AcmeUser, AcmeTeam, AcmeProject, AcmeTask } from "./entities.js";
export { AcmeAppContext } from "./context.js";
export { AcmeRootResolver, RootTeamsLoader } from "./resolvers/root-resolver.js";
export { AcmeUserResolver } from "./resolvers/user-resolver.js";
export { BasicUserLoader, UserAgeLoader } from "./resolvers/user-resolver.js";
export { AcmeTeamResolver, TeamBasicLoader, TeamMembersLoader } from "./resolvers/team-resolver.js";
export { AcmeSeeder } from "./seeder.js";
export type { AcmeApiClient } from "./acme-client.js";
export { AcmeApiClientStub } from "./acme-client.js";
export { AcmeSchema } from "./schema.js";

// ============================================================================
// ConnectorModule (default export)
// ============================================================================

import { ConnectorDef, ConnectorModule, Installation } from "@max/connector";
import { AcmeSchema } from "./schema.js";
import { AcmeSeeder } from "./seeder.js";
import { AcmeUserResolver } from "./resolvers/user-resolver.js";
import { AcmeTeamResolver } from "./resolvers/team-resolver.js";
import { AcmeRootResolver } from "./resolvers/root-resolver.js";

const AcmeDef = ConnectorDef.create({
  name: "acme",
  displayName: "Acme",
  description: "Test connector with users, teams, and projects",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: AcmeSchema,
  seeder: AcmeSeeder,
  resolvers: [AcmeUserResolver, AcmeTeamResolver, AcmeRootResolver],
});

export default ConnectorModule.create({
  def: AcmeDef,
  initialise(_config, _credentials) {
    // Acme is a test connector — no real credentials or config
    return Installation.create({ context: {} });
  },
});
