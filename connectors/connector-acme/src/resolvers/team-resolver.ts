/**
 * AcmeTeam Resolver - Maps AcmeTeam fields to loaders.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Page,
  type LoaderName,
} from "@max/core";
import { AcmeTeam, AcmeUser } from "../entities.js";
import { AcmeAppContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

/**
 * TeamBasicLoader - Fetches core team fields.
 */
export const TeamBasicLoader = Loader.entity({
  name: "acme:team:basic" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeTeam,

  async load(ref, ctx, deps) {
    const team = await ctx.api.teams.get(ref.id);
    return EntityInput.create(ref, {
      name: team.name,
      description: team.description,
      owner: AcmeUser.ref(team.ownerId),
    });
  },
});

/**
 * TeamMembersLoader - Loads the members collection for a team.
 * Returns Page<EntityInput<AcmeUser>> - members come back as user stubs.
 */
export const TeamMembersLoader = Loader.collection({
  name: "acme:team:members" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeTeam,
  target: AcmeUser,

  async load(ref, page, ctx, deps) {
    const result = await ctx.api.teams.listMembers(ref.id, {
      cursor: page.cursor,
      limit: page.limit,
    });

    const items = result.members.map((m) =>
      EntityInput.create(AcmeUser.ref(m.userId), {}),
    );

    return Page.from(items, result.hasMore, result.nextCursor);
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeTeamResolver = Resolver.for(AcmeTeam, {
  name: TeamBasicLoader.field("name"),
  description: TeamBasicLoader.field("description"),
  owner: TeamBasicLoader.field("owner"),
  members: TeamMembersLoader.field(),
});
