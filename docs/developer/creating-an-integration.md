# Creating an Integration

Quick guide to building a Max connector.

## 1. Define Your Entities

Entities are the data objects your connector syncs (Users, Files, Teams, etc.).

```typescript
// connectors/connector-acme/src/entities.ts
import { EntityDef, Field } from "@max/core";

export interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
  isAdmin: ScalarField<"boolean">;
}> {}

export const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
  isAdmin: Field.boolean(),
});
```

**Pattern:** Interface + const with same name. Both type and value in one.

## 2. Define Your Context

Context holds dependencies loaders need (API client, config, etc.).

```typescript
// connectors/connector-acme/src/context.ts
import { Context } from "@max/core";

class AcmeAppContext extends Context {
  api = Context.instance<AcmeApiClient>();
  installationId = Context.string;
}
```

**Pattern:** Extend `Context`, use type descriptors as field initializers.

## 3. Create Loaders

Loaders fetch data from your API.

```typescript
// connectors/connector-acme/src/resolvers/user-resolver.ts
import { Loader, EntityInput, Batch } from "@max/core";
import { AcmeUser } from "../entities.js";
import { AcmeAppContext } from "../context.js";

const BasicUserLoader = Loader.entityBatched({
  name: "acme:user:basic",
  context: AcmeAppContext,
  entity: AcmeUser,

  async load(refs, ctx, deps) {
    const ids = refs.map(r => r.id);
    const users = await ctx.api.users.getBatch(ids);

    return Batch.buildFrom(
      users.map(user =>
        EntityInput.create(AcmeUser.ref(user.id), {
          name: user.name,
          email: user.email,
        })
      )
    ).withKey(input => input.ref);
  }
});
```

**Loader types:**
- `Loader.entity()` - Single ref → EntityInput
- `Loader.entityBatched()` - Multiple refs → Batch (more efficient)
- `Loader.collection()` - Parent ref → Page of child refs
- `Loader.raw()` - Arbitrary data (config, metadata)

## 4. Create Resolver

Resolver maps entity fields to loaders.

```typescript
const AcmeUserResolver = Resolver.for(AcmeUser, {
  name: BasicUserLoader.field("name"),
  email: BasicUserLoader.field("email"),
  isAdmin: BasicUserLoader.field("isAdmin"),
});
```

**Pattern:** Multiple fields can point to the same loader (batching).

## 5. Wire It Up

*(Coming soon: Execution layer - how to register and run your connector)*

---

## File Structure

```
connectors/connector-acme/
├── src/
│   ├── entities.ts          # Entity definitions
│   ├── context.ts           # Context definition
│   ├── resolvers/
│   │   ├── user-resolver.ts # Loaders + resolver for AcmeUser
│   │   └── index.ts         # Export all resolvers
│   └── index.ts             # Main exports
└── package.json
```

## Quick Reference

```typescript
// Entities
const User = EntityDef.create("User", { name: Field.string() });

// Context
class AppContext extends Context {
  api = Context.instance<ApiClient>();
}

// Loaders
Loader.entity({ context, entity, load: async (ref, ctx, deps) => {...} })
Loader.entityBatched({ context, entity, load: async (refs, ctx, deps) => {...} })
Loader.collection({ context, entity, target, load: async (ref, page, ctx, deps) => {...} })
Loader.raw({ context, load: async (ctx, deps) => {...} })

// Resolver
Resolver.for(User, { name: SomeLoader.field("name") })
```
