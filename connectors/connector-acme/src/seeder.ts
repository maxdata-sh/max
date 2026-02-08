/**
 * AcmeSeeder - Cold-start bootstrapper for Acme connector.
 *
 * Creates a root team entity and returns a plan to sync its members.
 */

import { Seeder, SyncPlan, Step, EntityInput } from "@max/core";
import { AcmeRoot, AcmeTeam, AcmeUser } from "./entities.js";
import { AcmeAppContext } from "./context.js";

export const AcmeSeeder = Seeder.create({
  context: AcmeAppContext,

  async seed(ctx, engine) {
    // Create the root singleton
    const rootRef = AcmeRoot.ref("root");
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      // 1. Discover all teams from the root entry point
      Step.forRoot(rootRef).loadCollection("teams"),
      // 2. Load basic fields for all discovered teams
      Step.forAll(AcmeTeam).loadFields("name", "description", "owner"),
      // 3. Load member collections for all teams
      Step.forAll(AcmeTeam).loadCollection("members"),
      // 4. Load basic fields for all discovered users
      Step.forAll(AcmeUser).loadFields("name", "email"),
    ]);
  },
});
