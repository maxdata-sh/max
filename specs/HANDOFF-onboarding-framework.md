# Handoff: Onboarding Framework

Build the onboarding framework so that `max connect acme` walks the user through setup and creates a new installation.

## Context

We've designed a connector interface for Max. The full spec is at `specs/SPEC-connector-interface.md`. The developer guide at `docs/developer/creating-an-integration.md` has been updated with the latest conventions (read it — it's the source of truth for how connectors look from the author's perspective).

This session is about building the **onboarding step pipeline** and wiring it into the CLI so a user can connect a connector for the first time.

## What Exists

- `@max/core` — core types (EntityDef, Ref, Scope, Batch, Page, etc.) in `packages/core/`
- CLI commands in `packages/cli/src/commands/`
- Daemon entry at `packages/cli/src/index.ts`
- Server framework in `packages/server/`
- Acme sample connector in `connectors/connector-acme/` (entities, loaders, resolvers exist but no ConnectorDef/schema/onboarding yet)
- Test project at `bun-test-project/` with a `.max` directory

## What Needs Building

### 1. `@max/connector` package

New package at `packages/connector/`. Contains:

- **ConnectorSchema** — immutable class. `{ namespace, entities, roots }`. Methods: `getDefinition(name)`, `entityTypes`, `relationships`. Has `util.inspect` override
- **ConnectorDef** — static descriptor. `{ name, displayName, description, icon, version, scopes, schema, onboarding, seeder, resolvers }`
- **ConnectorModule** — pairs def + initialise function. `{ def, initialise(config, credentials) }`
- **ConnectorRegistry** — maps names to lazy-loaded modules
- **Installation** — runtime service. `{ context, start(), stop(), health() }`

### 2. Onboarding framework (`@max/connector/onboarding` or subpath)

**OnboardingFlow** — ordered list of steps. Generic over `TConfig`. Each step sees accumulated state from prior steps.

**Step types needed for MVP:**

- **InputStep** — declarative field collection. Has `fields` (plain config) and `credentials` (written to credential store). The user sees prompts, enters values
- **ValidationStep** — runs a check against accumulated state + credential store. Shows success/failure
- **SelectStep** — presents options (fetched dynamically), user picks one. Result goes into accumulated config
- **CustomStep** — escape hatch. Receives accumulated state, returns additions to it

OAuth2Step is NOT needed for MVP. Acme uses a simple API key.

**OnboardingContext** — passed to steps that need platform services:
```typescript
interface OnboardingContext {
  credentialStore: CredentialStore;
}
```

**Key property:** Secret fields collected in InputStep are written directly to the credential store during collection. They never appear in the accumulated config or the onboarding result. The result is just the plain config.

### 3. Credential infrastructure

From `docs/developer/creating-an-integration.md` (read this — the user refined the credential design):

- `Credential.string("key_name")` — simple stored secret
- `Credential.oauth({ refreshToken, accessToken, expiresIn, refresh })` — OAuth pair (future, not MVP)
- **CredentialStore** — platform-provided, scoped per installation. Basic key-value for MVP (local filesystem is fine). Interface: `get(key)`, `set(key, value)`, `has(key)`, `delete(key)`, `keys()`
- **CredentialProvider** — wraps the store with typed access. Connector receives this in `initialise`. `credentials.get(ApiToken)` returns a handle with `.get()` for JIT resolution

The initial implementation should be basic — a JSON file or SQLite table. No encryption, no audit logging. Just get it working. NFRs are deferred.

### 4. Wire up Acme connector

Update `connectors/connector-acme/` to use the new interfaces:

- Add `schema.ts` with ConnectorSchema
- Add `credentials.ts` with credential key declarations
- Add `onboarding.ts` with a simple flow (API key input → validation → maybe a select step)
- Add/update `index.ts` to export a ConnectorModule
- Add `config.ts` for the plain config type

### 5. CLI `max connect` command

A CLI command that:
1. Lists available connectors (from registry) or accepts a connector name
2. Runs the onboarding flow step by step (prompts in terminal)
3. Stores the resulting config
4. Stores credentials in the credential store
5. Creates an installation record

The onboarding runner is the platform's responsibility — it interprets the step types and renders them. For the CLI, this means:
- InputStep → prompt for each field (mask secret fields)
- ValidationStep → run the validator, show result
- SelectStep → fetch options, present numbered list, prompt for choice
- CustomStep → run the handler

## Design Decisions (already made — do not revisit)

- **Contexts are pure shape declarations.** No construction logic on the class. `initialise()` builds them
- **Config and credentials are separate.** Config is plain data (workspace IDs etc). Credentials go through the credential store. Never mix them
- **Sync is platform-driven.** Not a method on Installation. The platform pairs resolvers/seeder (from def) with context (from installation)
- **initialise is pure assembly.** No side effects. Takes config + credential store, constructs context, returns inert Installation. `start()` is separate
- **ConnectorDef is a static descriptor.** No factory methods. The initialise function lives on ConnectorModule, separate from the def
- **Onboarding produces only config.** Secrets go to the credential store during collection. The onboarding result type is just `TConfig`
- **Typed credential keys.** `Credential.string("name")` creates a typed reference. Compile-time safety over what secrets exist

## User Working Style

- **Design-first.** Do NOT jump into coding without agreeing on type foundations. When in doubt, present the interface before writing the implementation
- **Work backwards from DX.** Show consumer/client code first, then types, then implementation
- **No mutable classes.** Two kinds of class instances: helpers (make sense of data) and services (make changes in the real world)
- **Type+Companion Object pattern** for infrastructure types (see `CLAUDE.patterns.md`)
- **Test from `bun-test-project/`.** Run `cd bun-test-project && ../max <command>`
- **Bun runtime, not Node.** Use `bun:sqlite`, Bun workspaces, etc
- **MaxError for errors.** Never plain `throw new Error()`. See `docs/developer/error-system.md`

## Suggested Order of Work

1. Read `docs/developer/creating-an-integration.md` and `specs/SPEC-connector-interface.md` to ground yourself
2. Explore existing code: `packages/core/`, `connectors/connector-acme/`, `packages/cli/src/commands/`
3. Create `packages/connector/` package with core types (ConnectorSchema, ConnectorDef, ConnectorModule, Installation)
4. Add credential infrastructure (Credential keys, CredentialStore — basic implementation)
5. Build onboarding framework (OnboardingFlow, step types, runner)
6. Update Acme connector to use new interfaces
7. Build `max connect` CLI command
8. Test end-to-end: `cd bun-test-project && ../max connect acme`

## End State

A user runs `max connect acme`, gets prompted for an API key, it validates, they pick a workspace (or similar), and an installation record is created. The connector is ready to sync.
