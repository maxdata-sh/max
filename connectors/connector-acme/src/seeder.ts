/**
 * AcmeSeeder - Cold-start bootstrapper for Acme connector.
 *
 * Creates a root entity and returns a plan to discover workspaces, users, and projects.
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { AcmeRoot, AcmeWorkspace, AcmeUser, AcmeProject } from "./entities.js";
import { AcmeAppContext } from "./context.js";

export const AcmeSeeder = Seeder.create({
  context: AcmeAppContext,

  async seed(ctx, engine) {
    const rootRef = AcmeRoot.ref("root");
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Discover all workspaces from root
      Step.forRoot(rootRef).loadCollection("workspaces"),
      // 2. Load workspace names
      Step.forAll(AcmeWorkspace).loadFields("name"),
      // 3. Discover users and projects per workspace
      Step.forAll(AcmeWorkspace).loadCollection("users"),
      Step.forAll(AcmeWorkspace).loadCollection("projects"),
      // 4. Load user and project details
      Step.forAll(AcmeUser).loadFields("displayName", "email", "role", "active"),
      Step.forAll(AcmeProject).loadFields("name", "description", "status", "owner"),
    ]);
  },
});
