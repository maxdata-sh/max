/**
 * AcmeRoot Resolver - Maps AcmeRoot fields to loaders.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { AcmeRoot, AcmeTeam } from "../entities.js";
import { AcmeAppContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

/**
 * RootTeamsLoader - Discovers all teams from the root entry point.
 */
export const RootTeamsLoader = Loader.collection({
  name: "acme:root:teams" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeRoot,
  target: AcmeTeam,

  async load(ref, page, ctx, deps) {
    const result = await ctx.api.root.listTeams({
      cursor: page.cursor,
      limit: page.limit,
    });

    const items = result.teams.map((t) =>
      EntityInput.create(AcmeTeam.ref(t.id), {}),
    );

    return Page.from(items, result.hasMore, result.nextCursor);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeRootResolver = Resolver.for(AcmeRoot, {
  teams: RootTeamsLoader.field(),
});
