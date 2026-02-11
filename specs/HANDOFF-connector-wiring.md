# Handoff: Wire Connector Interface to Daemon

## Goal

Make `max schema acme` work end-to-end: daemon starts → registry has acme → CLI command queries schema and prints it.

## What Exists

### `@max/connector` package (`packages/connector/`)

Fully implemented and tested (44 tests). Contains:

| Module | File | Purpose |
|--------|------|---------|
| ConnectorSchema | `src/connector-schema.ts` | Immutable data model: namespace, entities, roots, derived relationships. Uses `Lazy`. |
| ConnectorDef | `src/connector-def.ts` | Static descriptor: name, displayName, description, icon, version, scopes, schema, seeder, resolvers. |
| Credential | `src/credential.ts` | `Credential.string(name)` and `Credential.oauth({ refreshToken, accessToken, expiresIn, refresh })`. |
| CredentialStore | `src/credential-store.ts` | Interface (dumb string k/v). `StubbedCredentialStore` for tests. |
| CredentialProvider | `src/credential-provider.ts` | Batteries-included: caching, TTL, OAuth refresh, rotation, schedulers. |
| Installation | `src/installation.ts` | Live instance: context, start(), stop(), health(). |
| ConnectorModule | `src/connector-module.ts` | Pairs ConnectorDef with `initialise(config, CredentialProvider) → Installation`. |
| ConnectorRegistry | `src/connector-registry.ts` | Maps names to lazy-loaded modules. `addLocalNamed`, `resolve`, `list`. |
| Errors | `src/errors.ts` | `connector` boundary. All errors use MaxError. |

### Acme connector (`connectors/connector-acme/`)

Has entities, context, loaders, resolvers, seeder — but exports them as **loose pieces**. Does NOT yet use the `@max/connector` types.

Key files:
- `src/entities.ts` — AcmeUser, AcmeTeam, AcmeRoot, AcmeProject, AcmeTask
- `src/context.ts` — AcmeAppContext
- `src/seeder.ts` — AcmeSeeder
- `src/resolvers/` — AcmeUserResolver, AcmeTeamResolver, AcmeRootResolver
- `src/index.ts` — currently re-exports loose pieces

### Daemon / CLI

- Daemon entry: `packages/cli/src/index.ts`
- Server framework: `packages/server/`
- CLI commands: `packages/cli/src/commands/`
- Rust shim → Unix socket `/tmp/max-daemon.sock` → Bun daemon

## Steps

### 1. Update connector-acme to export a ConnectorModule

Add `@max/connector` as a dependency in `connectors/connector-acme/package.json`.

Create `connectors/connector-acme/src/schema.ts`:
```typescript
import { ConnectorSchema } from "@max/connector";
import { AcmeUser, AcmeTeam, AcmeRoot, AcmeProject, AcmeTask } from "./entities.js";

export const AcmeSchema = ConnectorSchema.create({
  namespace: "acme",
  entities: [AcmeUser, AcmeTeam, AcmeRoot, AcmeProject, AcmeTask],
  roots: [AcmeRoot],
});
```

Update `connectors/connector-acme/src/index.ts` to export a ConnectorModule as default:
```typescript
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
  initialise(config, credentials) {
    // Acme is a test connector — no real credentials or config
    return Installation.create({ context: {} });
  },
});
```

### 2. Wire registry into daemon startup

Read `packages/cli/src/index.ts` (daemon entry) to understand the current startup flow. The daemon needs to:

1. Create a `ConnectorRegistry`
2. Register known connectors: `registry.addLocalNamed("acme", () => import("@max/connector-acme"))`
3. Make the registry accessible to command handlers (likely via the server's service/DI pattern — check how existing services like the entity store are wired)

**Key question**: How does the daemon currently pass services to command handlers? Follow that pattern for the registry. Check `@max/server` for the service registration pattern.

### 3. Create `max schema` CLI command

New command at `packages/cli/src/commands/schema.ts` (follow existing command patterns):

```
max schema <connector-name>
```

The command should:
1. Get the registry from the server/service context
2. Call `registry.resolve(connectorName)`
3. Read `module.def.schema`
4. Print: namespace, entity types, roots, relationships

Example output:
```
acme (5 entities, 1 root)

Entities:
  AcmeUser      (name, email, age, isAdmin)
  AcmeTeam      (name, description, owner → AcmeUser, members → AcmeUser[])
  AcmeRoot      (teams → AcmeTeam[])
  AcmeProject   (name, status, createdAt, team → AcmeTeam, lead → AcmeUser)
  AcmeTask      (title, description, priority, completed, project → AcmeProject, assignee → AcmeUser)

Roots:
  AcmeRoot

Relationships:
  AcmeTeam.owner → AcmeUser (one)
  AcmeTeam.members → AcmeUser (many)
  AcmeRoot.teams → AcmeTeam (many)
  AcmeProject.team → AcmeTeam (one)
  AcmeProject.lead → AcmeUser (one)
  AcmeTask.project → AcmeProject (one)
  AcmeTask.assignee → AcmeUser (one)
```

### 4. Register the command

Add the schema command to whatever command registry the daemon uses. Check how existing commands (like `sync`, `query`, etc.) are registered.

## Design Decisions to Preserve

- **CredentialStore vs CredentialProvider**: Store = dumb storage (platform). Provider = batteries-included (connector-facing). Connectors never touch the raw store.
- **OAuth refs are plain tagged name strings** — no circular references. Provider maps names to OAuthCredentials at construction.
- **ConnectorDef.onboarding** is intentionally omitted — OnboardingFlow (`@max/connector/onboarding` subpath) is not yet built.
- **All errors use MaxError** with the `connector` boundary. Error defs in `packages/connector/src/errors.ts`.
- **ConnectorModule uses plain objects** (not classes) — it's just a def + function pair, no internal state.

## Spec Reference

Full connector interface spec: `specs/SPEC-connector-interface.md`
Developer guide: `docs/developer/creating-an-integration.md`

## Verification

```bash
turbo run typecheck                                    # type check
bun test packages/connector/src/__test__/             # connector package tests (44 tests)
cd bun-test-project && ../max schema acme             # end-to-end
```
