/**
 * AcmeUser Resolver - Maps AcmeUser fields to loaders.
 */

import {
  Loader,
  Resolver,
  EntityInput,
  Batch,
  type LoaderName,
} from "@max/core";
import { AcmeUser } from "../entities.js";
import { AcmeContext } from "../context.js";

// ============================================================================
// Loaders
// ============================================================================

/**
 * BasicUserLoader - Fetches core user fields in batch.
 */
const BasicUserLoader = Loader.entityBatched({
  name: "acme:user:basic" as LoaderName,
  context: AcmeContext,
  entity: AcmeUser,
  strategy: "autoload",

  async load(refs, ctx, deps) {
    const ids = refs.map((r) => r.id);
    const users = await ctx.api.users.getBatch(ids);

    // Build batch from EntityInputs
    return Batch.buildFrom(
      users.map((user) =>
        EntityInput.create(AcmeUser.ref(user.id), {
          name: user.name,
          email: user.email,
        })
      )
    ).withKey((input) => input.ref);
  },
});

/**
 * UserAgeLoader - Fetches user age (single ref, manual).
 * Example of a more expensive field that's loaded on-demand.
 */
const UserAgeLoader = Loader.entity({
  name: "acme:user:age" as LoaderName,
  context: AcmeContext,
  entity: AcmeUser,
  strategy: "manual",

  async load(ref, ctx, deps) {
    const user = await ctx.api.users.get(ref.id);

    return EntityInput.create(ref, {
      age: user.age,
    });
  },
});

// ============================================================================
// Resolver
// ============================================================================

/**
 * AcmeUserResolver - Maps AcmeUser fields to loaders.
 */
const AcmeUserResolver = Resolver.for(AcmeUser, {
  name: BasicUserLoader.field("name"),
  email: BasicUserLoader.field("email"),
  age: UserAgeLoader.field("age"),
  isAdmin: BasicUserLoader.field("isAdmin"), // Not actually loaded by BasicUserLoader, but shows the pattern
});

// ============================================================================
// Type Safety Tests
// ============================================================================

const _badResolver = Resolver.for(AcmeUser, {
  // @ts-expect-error - 'foo' is not a field on AcmeUser
  foo: BasicUserLoader.field("name"),
});

// Silence unused variable warnings
void AcmeUserResolver;
void _badResolver;
