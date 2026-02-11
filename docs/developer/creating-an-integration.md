# Creating an Integration

Quick guide to building a Max connector.

## Start: Define Your Entities

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

## Next: Define Your Context

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

## Next: Create Loaders

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

## Next: Create Resolver

Resolver maps entity fields to loaders.

```typescript
const AcmeUserResolver = Resolver.for(AcmeUser, {
  name: BasicUserLoader.field("name"),
  email: BasicUserLoader.field("email"),
  isAdmin: BasicUserLoader.field("isAdmin"),
});
```

**Pattern:** Multiple fields can point to the same loader (batching).

## Next: Define Your Schema

ConnectorSchema declares your connector's data model: all entities and which ones are roots (entry points for sync).

```typescript
// connectors/connector-acme/src/schema.ts
import { ConnectorSchema } from "@max/connector";
import { AcmeUser, AcmeTeam, AcmeRoot } from "./entities.js";

export const AcmeSchema = ConnectorSchema.create({
  namespace: "acme",
  entities: [AcmeUser, AcmeTeam, AcmeRoot],
  roots: [AcmeRoot],
});
```

The schema provides helpers for navigating the data model:

```typescript
AcmeSchema.entityTypes;              // ["AcmeUser", "AcmeTeam", "AcmeRoot"]
AcmeSchema.getDefinition("AcmeUser") // EntityDef | undefined
AcmeSchema.relationships;            // derived from ref/collection fields
```

## Next: Set Up Credentials

Credentials are typed references to secrets your connector needs. Two kinds:

**Simple keys** for API tokens:

```typescript
// connectors/connector-acme/src/credentials.ts
import { Credential } from "@max/connector";

export const ApiToken = Credential.string("api_token");
```

**OAuth pairs** for access/refresh token flows:

```typescript
import { Credential } from "@max/connector";

export const GoogleAuth = Credential.oauth({
  refreshToken: "refresh_token",
  accessToken: "access_token",
  expiresIn: 3500,  // seconds — cache TTL for access token
  async refresh(refreshToken) {
    const result = await google.oauth2.refresh(refreshToken);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,  // if provider rotates
    };
  },
});
```

In your connector's `initialise`, you receive a `CredentialProvider` which wraps the platform's credential store with caching and automatic refresh:

```typescript
initialise(config, credentials: CredentialProvider) {
  // Simple key — handle reads directly from store
  const apiKey = credentials.get(ApiToken);
  await apiKey.get();  // "sk-123"

  // OAuth — handle caches access token, refreshes when stale
  const client = new AcmeClient({
    token: credentials.get(GoogleAuth.accessToken),
  });

  // Inside the client, when making API calls:
  const t = await this.token.get();  // always-valid access token
}
```

The framework calls `credentials.startRefreshSchedulers()` during startup to proactively keep tokens fresh.

## Finally: Create ConnectorDef

ConnectorDef is the static descriptor that ties everything together.

```typescript
// connectors/connector-acme/src/index.ts
import { ConnectorDef } from "@max/connector";
import { AcmeSchema } from "./schema.js";
import { AcmeSeeder } from "./seeder.js";
import { AcmeUserResolver, AcmeTeamResolver } from "./resolvers/index.js";

export const AcmeDef = ConnectorDef.create({
  name: "acme",
  displayName: "Acme",
  description: "Sync users and teams from Acme",
  icon: "https://acme.com/icon.svg",
  version: "1.0.0",
  scopes: ["read:users", "read:teams"],
  schema: AcmeSchema,
  seeder: AcmeSeeder,
  resolvers: [AcmeUserResolver, AcmeTeamResolver],
});
```

---

## File Structure

```
connectors/connector-acme/
├── src/
│   ├── entities.ts          # Entity definitions
│   ├── schema.ts            # ConnectorSchema
│   ├── credentials.ts       # Credential declarations
│   ├── context.ts           # Context definition
│   ├── seeder.ts            # Seeder (cold-start sync plan)
│   ├── resolvers/
│   │   ├── user-resolver.ts # Loaders + resolver for AcmeUser
│   │   └── index.ts         # Export all resolvers
│   └── index.ts             # ConnectorDef + main exports
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

// Schema
ConnectorSchema.create({ namespace: "acme", entities: [...], roots: [...] })

// Credentials
Credential.string("api_token")
Credential.oauth({ refreshToken, accessToken, expiresIn, refresh })

// ConnectorDef
ConnectorDef.create({ name, displayName, description, icon, version, scopes, schema, seeder, resolvers })
```
