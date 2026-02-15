# Max Developer Guide

Documentation for building Max connectors.

## Getting Started

New to Max? Start here:

1. **[Creating an Integration](./creating-an-integration.md)**
   Step-by-step guide: entities, contexts, loaders, resolvers

2. **[Core Concepts](./core-concepts.md)**
   Understand Ref, Scope, EntityDef, EntityInput, EntityResult

3. **[Utilities](./utilities.md)**
   Tools you'll use: Batch, Page, Brand, Fields, StaticTypeCompanion

## Quick Example

```typescript
// 1. Define entity
const AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
});

// 2. Define context
class AcmeAppContext extends Context {
  api = Context.instance<AcmeApiClient>();
}

// 3. Create loader
const UserLoader = Loader.entity({
  name: "acme:user:basic",
  context: AcmeAppContext,
  entity: AcmeUser,
  async load(ref, ctx, deps) {
    const user = await ctx.api.users.get(ref.id);
    return EntityInput.create(ref, {
      name: user.name,
      email: user.email,
    });
  }
});

// 4. Create resolver
const AcmeUserResolver = Resolver.for(AcmeUser, {
  name: UserLoader.field("name"),
  email: UserLoader.field("email"),
});
```

## Architecture

See the **[Architecture docs](./architecture/)** for package boundaries, dependency rules, and design principles.

Data flow (sync pipeline):
```
SyncPlan → Resolvers → Loaders → Engine → Storage
```

## Packages

- `@max/core` - Types, data structures, Engine (data access), utilities
- `@max/connector` - Connector SDK (ConnectorDef, OnboardingFlow)
- `@max/app` - Business logic, services, orchestration
- `@max/cli` - CLI presentation, daemon hosting
- `@max/storage-sqlite` - SQLite storage implementation

## Next Steps

- Read [Creating an Integration](./creating-an-integration.md) for a complete walkthrough
- Check `connectors/connector-acme` for a working example
- Explore `packages/core/src/__test__/sample-connector.ts` for type system examples
