/**
 * AcmeUser Resolver - Maps AcmeUser fields to loaders.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  type LoaderName,
} from "@max/core";
import { AcmeUser } from "../entities.js";
import { AcmeAppContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

export const UserBasicLoader = Loader.entity({
  name: "acme:user:basic" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeUser,
  strategy: "autoload",

  async load(ref, ctx, deps) {
    const user = await ctx.api.client.getUser(ref.id);
    return EntityInput.create(ref, {
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      active: user.active,
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

export const AcmeUserResolver = Resolver.for(AcmeUser, {
  displayName: UserBasicLoader.field("displayName"),
  email: UserBasicLoader.field("email"),
  role: UserBasicLoader.field("role"),
  active: UserBasicLoader.field("active"),
});
