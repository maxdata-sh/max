# Module Boundaries

How Max's packages relate to each other, what each one owns, and where new code should go.

## Package Overview

```
@max/core            Types and foundations. No I/O, no services.
    ^
@max/connector       Connector SDK. What connector authors import.
    ^
@max/app             Business logic. Services, orchestration, config.
    ^
@max/cli             Presentation + daemon hosting. Owns all terminal I/O.
```

Each layer depends only on layers below it. Nothing depends on `@max/cli`.

## `@max/core`

The vocabulary of Max. Entity types, Ref, Schema, Fields, brands, Engine (the data access layer used by loaders), and foundational utilities like `StaticTypeCompanion`, `makeLazy`, and `MaxError`.

No services, no I/O, no file system access. Pure types and data structures.

## `@max/connector`

The connector SDK. Contains `ConnectorDef`, `ConnectorModule`, `OnboardingFlow`, and `ConnectorRegistry`. This is what connector authors use to define integrations.

`OnboardingFlow` describes *what* to collect from a user during setup (fields, credentials, validation steps, selections). It never describes *how* to render those steps &mdash; that's a platform concern.

## `@max/app`

The business logic layer. Contains `MaxGlobalApp`, `MaxProjectApp`, and the services they expose.

### Two Scopes

**`MaxGlobalApp`** &mdash; always constructible. Operations that don't require a project:
- Initialise a new project
- List known projects
- Global configuration

**`MaxProjectApp`** &mdash; requires a `.max/` directory. Operations scoped to a specific project:
- Connector management
- Schema inspection
- Sync orchestration
- Data search
- Onboarding

If no project exists, `MaxProjectApp` is not constructed. The consumer (CLI, web, etc.) checks for project existence at the routing level and handles the error.

### Dependencies as Constructor Params

Both app classes take a named dependencies object:

```typescript
interface MaxProjectAppDependencies {
  projectConfig: ProjectConfig
  projectManager: ProjectManager
  connectorRegistry: ConnectorRegistry
  daemonManager: ProjectDaemonManager
}

const app = new MaxProjectApp(deps)
```

Dependencies can be supplied eagerly or lazily (via `makeLazy`). The app doesn't know which &mdash; it accesses `this.deps.connectorRegistry` and the lazy infrastructure handles deferred construction.

### Service Exposure

`MaxProjectApp` exposes its services as public getters. Consumers navigate by domain:

```typescript
app.connectorRegistry.list()
app.connectorRegistry.resolve("linear")
app.daemonManager.status()
app.projectManager.prepare("linear")
```

**Treat service interfaces as public contracts.** When designing a service, design its interface as if external consumers will call it directly &mdash; because they will.

### When to Add App Methods

App-level methods exist for **cross-service orchestration** &mdash; operations that span multiple services and don't belong on any single one:

```typescript
// This touches connectorRegistry + projectManager + credentialStore
app.connect("linear")
```

**The rule:** does the operation touch more than one service? If yes, it's orchestration and belongs as a method on the app. If it touches a single service, consumers go through that service directly.

Don't duplicate single-service operations as app methods. `app.connectorRegistry.resolve(name)` doesn't need an `app.getSchema(name)` wrapper.

### Structured Data Only

Everything in `@max/app` returns structured data. No formatted strings, no ANSI codes, no terminal assumptions. A `Schema` object, not a pretty-printed schema string. A `ProjectDaemonStatus` DTO, not a status message.

This is the reuse boundary. A CLI formats the data for a terminal. A web layer serialises it as JSON. A test asserts against it directly. The app layer doesn't know or care which consumer is calling.

## `@max/cli`

The terminal presentation layer. Everything that touches the user's terminal:

- **Argv parsing** &mdash; Optique parsers, help text, shell completions
- **Output formatting** &mdash; ANSI colours, tables, `--json` flags
- **Interactive I/O** &mdash; readline, prompts, onboarding step rendering
- **Daemon hosting** &mdash; socket server, PID management, process lifecycle

### Daemon is a Deployment Mode

The daemon is not a separate domain. It's the app layer hosted in a persistent process, reachable over a Unix socket. The CLI has two execution modes:

1. **Direct:** construct app &rarr; run operation &rarr; format output &rarr; exit
2. **Daemon:** construct app &rarr; keep alive &rarr; accept socket requests &rarr; run operation &rarr; format output &rarr; respond

The app layer is identical in both modes. The socket protocol and process lifecycle are purely CLI concerns.

### Formatting is a CLI Concern

DTOs from `@max/app` are formatted by CLI-side printer functions:

```typescript
formatDaemonStatus(status: ProjectDaemonStatus): string
```

No `CliPrintable` interface on the DTOs. No formatting logic in the app layer. If a DTO doesn't expose enough data for the formatter, the fix is to enrich the DTO's public surface, not to move formatting into the app.

### Onboarding Rendering

`OnboardingFlow` (defined in `@max/connector`) describes steps declaratively. The CLI interprets those steps as terminal prompts: readline for input steps, numbered menus for select steps, spinners for validation steps. A web layer would interpret the same steps as form wizards. The flow definition is shared; the rendering is platform-specific.

## Where New Code Goes

| I'm adding... | Package |
|---|---|
| A new entity type, brand, or data structure | `@max/core` |
| A new connector | `connectors/connector-{name}` using `@max/connector` |
| A field type, loader variant, or sync primitive | `@max/core` |
| A new business operation | `@max/app` (service method or app method) |
| A new CLI command | `@max/cli` (parser + routing + formatter) |
| Output formatting or display logic | `@max/cli` |
| A new onboarding step type | `@max/connector` (step definition) + `@max/cli` (step renderer) |

## Replication Boundary

If a second platform (web UI, REST API) were added, it would import `@max/app` and replace `@max/cli` entirely. The shared kernel is everything at and below the app layer. The replicated surface is input parsing, output formatting, and interactive flow rendering.
