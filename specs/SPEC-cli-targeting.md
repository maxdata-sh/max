# SPEC: CLI Targeting with Max URLs

> Authored: 2026-02-22. Implementation spec for level-aware CLI targeting.
> Status: Design complete, ready for review.
> Depends on: Max URLs and Federation Addressing (implemented)
> Design doc: `specs/DESIGN-cli-targeting.md`

---

## Overview

Today, every `max` command implicitly assumes workspace context (discovered via `.max/` in cwd). There is no way to target a different workspace, operate at the global level, or directly target an installation.

This spec introduces **level-aware targeting**: every command executes at a resolved level (global, workspace, or installation), determined by context *before* the command runs. The command receives the appropriate client and operates naturally.

Six changes:

1. **`ResolvedContext`** — new type representing the resolved execution level + client
2. **Pre-parse extraction** — `-t` and `-g` flags parsed before command dispatch
3. **Context resolution** — cwd, env, flags → `ResolvedContext` via `MaxUrlResolver`
4. **Command level declarations** — commands declare which levels they support
5. **Two-phase dispatch** — resolve context first, then parse + execute the command
6. **Display conventions** — URLs in `ls` and `status` output

---

## 1. ResolvedContext

### Type

New file: `packages/cli/src/resolved-context.ts`

```typescript
import { MaxUrl, MaxUrlLevel } from '@max/core'
import type { GlobalClient } from '@max/federation'
import type { WorkspaceClient } from '@max/federation'
import type { InstallationClient } from '@max/federation'

export type ResolvedContext =
  | { level: 'global';       url: MaxUrl; client: GlobalClient }
  | { level: 'workspace';    url: MaxUrl; client: WorkspaceClient }
  | { level: 'installation'; url: MaxUrl; client: InstallationClient }
```

Every command handler receives a `ResolvedContext`. The discriminated `level` field lets handlers branch:

```typescript
async runLs(ctx: ResolvedContext): Promise<string> {
  switch (ctx.level) {
    case 'global':      return this.listWorkspaces(ctx.client, ctx.url)
    case 'workspace':   return this.listInstallations(ctx.client, ctx.url)
    case 'installation': throw ErrCommandNotAtLevel.create({ command: 'ls', level: 'installation', url: ctx.url.toString() })
  }
}
```

### Relationship to MaxUrlResolver

`ResolvedContext` is constructed from `MaxUrlResolver.resolve()` output (`ResolvedTarget`), plus the resolved `MaxUrl`. They carry the same information but serve different layers:

- `ResolvedTarget` — federation layer, returned by the resolver
- `ResolvedContext` — CLI layer, includes the url for display and error messages

```typescript
function toContext(target: ResolvedTarget, url: MaxUrl): ResolvedContext {
  return { ...target, url }
}
```

### Files

| File | Change |
|------|--------|
| `packages/cli/src/resolved-context.ts` | NEW — `ResolvedContext` type + `toContext` helper |

---

## 2. Pre-Parse Extraction

### Current state

`packages/cli/src/index.ts` already has a pre-parse step (lines 372–377) that extracts daemon flags (`--dev-mode`, `--project-root`, `--daemonized`) before the main command parser runs. This uses `@optique/core`'s `passThrough` to capture remaining argv.

### Change

Extend the pre-parse to extract `-t`, `-g`, and the `MAX_TARGET` env var:

```typescript
// packages/cli/src/index.ts — extended pre-parse

const globalFlagParser = object({
  devMode: withDefault(flag('--dev-mode'), () => process.env.MAX_DEV_MODE === 'true'),
  projectRoot: withDefault(option('--project-root', string()), () => process.cwd()),
  daemonized: withDefault(flag('--daemonized'), false),
  target: optional(option('-t', '--target', string(), {
    description: message`Target a specific node (Max URL or name)`,
  })),
  global: withDefault(flag('-g', '--global'), false),
  maxCommand: passThrough({ format: 'greedy' }),
})
```

The parsed result provides `target?: string` and `global: boolean`, with the remaining command argv in `maxCommand`.

### Precedence

```
-t <value>  wins over  -g  wins over  MAX_TARGET  wins over  cwd
```

If both `-t` and `-g` are provided, `-t` wins (more specific). `-g` is sugar for `-t ~`.

```typescript
function effectiveTarget(parsed: { target?: string; global: boolean }): string | undefined {
  if (parsed.target) return parsed.target
  if (parsed.global) return '~'
  return process.env.MAX_TARGET ?? undefined
}
```

### Files

| File | Change |
|------|--------|
| `packages/cli/src/index.ts` | Extend `globalFlagParser` with `-t`, `-g` |

---

## 3. Context Resolution

### Resolution function

New file: `packages/cli/src/resolve-context.ts`

```typescript
export interface ContextResolutionInput {
  /** Raw target string from -t, -g, or MAX_TARGET. undefined = use cwd. */
  target: string | undefined
  /** The cwd of the invoking process. */
  cwd: string
  /** The GlobalMax instance (always available from the daemon). */
  globalMax: GlobalMax
}

export function resolveContext(input: ContextResolutionInput): ResolvedContext
```

### Algorithm

```
1. If no target:
   a. Detect cwd context (workspace or installation from .max/ structure)
   b. If no .max/ found → global context (the daemon itself)

2. If target starts with "max://":
   a. Parse as absolute MaxUrl
   b. Resolve via globalMax.maxUrlResolver()

3. If target is "~":
   a. Global context

4. Otherwise (relative target):
   a. Resolve cwd context first (must be workspace or installation)
   b. Interpret target as a child name within cwd context:
      - If cwd is workspace → target is installation name
      - If cwd is global → target is workspace name
   c. Construct MaxUrl from cwd context + target segment
   d. Resolve via globalMax.maxUrlResolver()
```

### cwd detection

Today, `findProjectRoot()` walks up from cwd looking for `.max/` + `max.json`. This gives workspace context.

Extend to detect installation context:

```typescript
export interface CwdContext {
  level: 'global' | 'workspace' | 'installation'
  workspaceRoot?: string        // path to project root (has .max/)
  installationName?: string     // name derived from .max/installations/<name>/
}

export function detectCwdContext(cwd: string): CwdContext {
  // Check if cwd is inside .max/installations/<name>/
  // Walk up looking for installations/ parent, then .max/ parent
  const installationMatch = cwd.match(/\.max\/installations\/([^/]+)/)
  if (installationMatch) {
    const installationName = installationMatch[1]
    // Walk up to find the workspace root
    const workspaceRoot = findProjectRoot(cwd)
    if (workspaceRoot) {
      return { level: 'installation', workspaceRoot, installationName }
    }
  }

  // Check for workspace root
  const workspaceRoot = findProjectRoot(cwd)
  if (workspaceRoot) {
    return { level: 'workspace', workspaceRoot }
  }

  // No project found — global context
  return { level: 'global' }
}
```

### Errors

Add to `packages/cli/src/errors.ts` (or equivalent):

```typescript
export const ErrTargetResolutionFailed = CliBoundary.define('target_resolution_failed', {
  customProps: ErrFacet.props<{ target: string; reason: string }>(),
  facets: [BadInput],
  message: (d) => `Cannot resolve target "${d.target}" — ${d.reason}`,
})

export const ErrCommandNotAtLevel = CliBoundary.define('command_not_at_level', {
  customProps: ErrFacet.props<{ command: string; level: string; url: string; supportedLevels: string[] }>(),
  facets: [BadInput],
  message: (d) => `"${d.command}" is not available at ${d.level} level.\n  Supported levels: ${d.supportedLevels.join(', ')}\n  Current context: ${d.url}\n  Hint: max -t <${d.supportedLevels[0]}> ${d.command}`,
})
```

### Files

| File | Change |
|------|--------|
| `packages/cli/src/resolve-context.ts` | NEW — `resolveContext`, `detectCwdContext`, `CwdContext` |
| `packages/cli/src/resolved-context.ts` | NEW — `ResolvedContext` type (from section 1) |
| `packages/cli/src/errors.ts` | Add `ErrTargetResolutionFailed`, `ErrCommandNotAtLevel` |
| `packages/platform-bun/src/util/find-project-root.ts` | May need minor adjustment for installation detection |

---

## 4. Command Level Declarations

### CommandDef type

New file: `packages/cli/src/command-def.ts`

```typescript
import type { MaxUrlLevel } from '@max/core'

export interface CommandDef<T = unknown> {
  /** Command name as typed by the user. */
  readonly name: string
  /** Which levels this command supports. Used for dispatch gating and error messages. */
  readonly levels: readonly MaxUrlLevel[]
  /** The @optique parser for this command's arguments. */
  readonly parser: Parser<Mode, T, unknown>
  /** The handler that executes the command. */
  readonly handler: (args: T, ctx: ResolvedContext, prompter?: Prompter) => Promise<string>
}
```

### Registering commands

Each command declares its levels:

```typescript
const lsDef: CommandDef = {
  name: 'ls',
  levels: ['global', 'workspace'],
  parser: command('ls', object({ cmd: constant('ls') }), {
    description: message`List children of current context`,
  }),
  handler: runLs,
}

const syncDef: CommandDef = {
  name: 'sync',
  levels: ['installation'],
  parser: command('sync', object({
    cmd: constant('sync'),
    installation: optional(argument(installationCompleter, {
      description: message`Installation to sync`,
    })),
  }), {
    description: message`Sync data from a connected source`,
  }),
  handler: runSync,
}

const statusDef: CommandDef = {
  name: 'status',
  levels: ['global', 'workspace', 'installation'],
  parser: command('status', object({
    cmd: constant('status'),
    target: optional(argument(string(), {
      description: message`Target to inspect`,
    })),
  }), {
    description: message`Show status of current context`,
  }),
  handler: runStatus,
}
```

### Dispatch gating

Before parsing the command, the dispatch layer checks whether the command supports the resolved level:

```typescript
function gateCommand(def: CommandDef, ctx: ResolvedContext): void {
  if (!def.levels.includes(ctx.level)) {
    throw ErrCommandNotAtLevel.create({
      command: def.name,
      level: ctx.level,
      url: ctx.url.toString(),
      supportedLevels: [...def.levels],
    })
  }
}
```

This produces the error:
```
$ max -g sync
Error: "sync" is not available at global level.
  Supported levels: installation
  Current context: max://~
  Hint: max -t <installation> sync
```

vs an unknown command:
```
$ max frobnicate
Error: Unknown command "frobnicate".
```

### Files

| File | Change |
|------|--------|
| `packages/cli/src/command-def.ts` | NEW — `CommandDef` type |
| `packages/cli/src/commands/*.ts` | Migrate to `CommandDef` pattern |

---

## 5. Two-Phase Dispatch

### Current flow

```
argv → pre-parse (daemon flags) → @optique full parse → switch(cmd) → handler
```

All commands are parsed in a single `or()` combinator. Workspace context is lazily resolved inside handlers.

### New flow

```
argv → pre-parse (-t, -g, daemon flags) → resolve context → gate command level → parse command → handler(args, ctx)
```

### Implementation

```typescript
// packages/cli/src/index.ts — revised execute()

async execute(req: CliRequest, prompter?: Prompter): Promise<CliResponse> {
  if (req.kind === 'complete') {
    return this.suggest(req)
  }

  const color = req.color ?? this.cfg.useColor

  // Phase 1: Identify command name (first non-flag arg)
  const commandName = findCommandName(req.argv)

  // Phase 2: Resolve context
  const target = effectiveTarget(this.cfg)  // from pre-parsed -t / -g / env
  const ctx = resolveContext({
    target,
    cwd: req.cwd ?? this.cfg.cwd,
    globalMax: await this.lazy.globalMax,
  })

  // Phase 3: Find command def + gate level
  const def = this.commandRegistry.get(commandName)
  if (!def) {
    throw ErrUnknownCommand.create({ command: commandName })
  }
  gateCommand(def, ctx)

  // Phase 4: Parse command-specific args
  const parsed = await parseAndValidateArgs(def.parser, 'max', req.argv, color)
  if (!parsed.ok) return parsed.response

  // Phase 5: Execute
  const result = await def.handler(parsed.value, ctx, prompter)
  return { exitCode: 0, stdout: result ? result + '\n' : '' }
}
```

### `findCommandName`

Extracts the first non-flag argument from argv. This is needed to look up the `CommandDef` before full parsing:

```typescript
function findCommandName(argv: readonly string[]): string | undefined {
  for (const arg of argv) {
    if (!arg.startsWith('-')) return arg
  }
  return undefined  // no command → default to 'status'
}
```

### Default command

When no command name is found, default to `status`:

```typescript
const def = this.commandRegistry.get(commandName ?? 'status')
```

This implements `max` (bare) → `max status`.

### Files

| File | Change |
|------|--------|
| `packages/cli/src/index.ts` | Rewrite `execute()` to two-phase dispatch |
| `packages/cli/src/command-registry.ts` | NEW — registry of `CommandDef` instances, `get(name)` lookup |

---

## 6. Display Conventions

### URLs in listings

`ls` and `status` show the `max://` URL for each node. This builds intuition for `-t` targeting.

#### `max ls` at workspace level

```
 my-team (max://~/my-team)

  NAME             URL                              STATUS
  hubspot-prod     max://~/my-team/hubspot-prod     healthy
  linear-eng       max://~/my-team/linear-eng       syncing
```

#### `max -g ls` at global level

```
 ~ (max://~)

  NAME             URL                    STATUS
  my-team          max://~/my-team        healthy (2 installations)
  staging          max://~/staging        degraded (1/3 healthy)
```

#### `max status` at workspace level

```
 my-team (max://~/my-team)

  hubspot-prod    healthy    last sync 2m ago
  linear-eng      syncing    started 30s ago
```

#### `max status` at installation level

```
 hubspot-prod (max://~/my-team/hubspot-prod)

  Connector:   hubspot
  Status:      healthy
  Last sync:   2m ago (completed, 142 entities)
  Schema:      3 entities, 12 fields
```

### Context header

Every level-aware command prints a **context header** as the first line. Format:

```
 <name> (<max-url>)
```

This tells the user where they are. When the context was set via `-t`, this confirms what resolved.

### JSON output

When `--output json` is used, every object includes a `url` field:

```json
{
  "name": "hubspot-prod",
  "url": "max://~/my-team/hubspot-prod",
  "status": "healthy",
  ...
}
```

### Building URLs for display

The handler constructs child URLs using `MaxUrl.child()`:

```typescript
async listInstallations(client: WorkspaceClient, contextUrl: MaxUrl): Promise<string> {
  const installations = await client.listInstallations()
  const rows = installations.map(inst => ({
    name: inst.name,
    url: contextUrl.child(inst.name).toString(),
    status: '...',
  }))
  // format as table
}
```

### Files

| File | Change |
|------|--------|
| `packages/cli/src/commands/ls-command.ts` | NEW — `ls` command definition + handler |
| `packages/cli/src/commands/status-command.ts` | NEW — `status` command definition + handler |
| `packages/cli/src/commands/sync-command.ts` | Migrate to `CommandDef`, installation-name addressing |

---

## 7. Sync Command Migration

### Current

```typescript
// Two positional args: connector + name
target: tuple([
  argument(installedConnectorSource, { ... }),
  argument(installationName, { ... }),
])
```

Usage: `max sync linear engineering`

### New

```typescript
// One optional positional: installation name
installation: optional(argument(installationCompleter, {
  description: message`Installation to sync`,
}))
```

Usage: `max sync hubspot-prod` (at workspace level) or `max sync` (at installation level)

### Handler logic

```typescript
async runSync(args: { installation?: string }, ctx: ResolvedContext): Promise<string> {
  let installationClient: InstallationClient

  if (ctx.level === 'installation') {
    // Already targeted — use directly
    installationClient = ctx.client
  } else if (ctx.level === 'workspace') {
    // Need an installation name
    if (!args.installation) {
      throw ErrSyncRequiresTarget.create()
    }
    const resolved = ctx.client.installationByNameOrId?.(args.installation)
    // ... or use the MaxUrlResolver to resolve ctx.url.child(args.installation)
  } else {
    // Global level — sync doesn't apply
    // (already gated by CommandDef.levels, so this is unreachable)
  }

  const handle = await installationClient.sync()
  const result = await handle.completion()
  // ...
}
```

### Sync safety

At workspace level with no target and no `--all --force`:

```
Error: sync requires an installation target.
  Use: max sync <installation-name>
  Or:  max sync --all --force   (syncs all installations)
```

### Files

| File | Change |
|------|--------|
| `packages/cli/src/commands/sync-command.ts` | Rewrite: single optional positional, `CommandDef` pattern |

---

## 8. Tab Completion for `-t`

### Outcome

Tab completion for the `-t` value walks the hierarchy:

```bash
max -t max://~/          → suggests workspace names
max -t max://~/my-team/  → suggests installation names in my-team
max -t hub<TAB>          → suggests installation names matching "hub" (relative)
```

### Mechanism

The completer for `-t` parses the partial input to determine how many segments are present, then asks the appropriate node for its children:

- 0 segments after host (`max://~/`) → ask GlobalMax for workspace names
- 1 segment after host (`max://~/my-team/`) → resolve workspace, ask for installation names
- Relative (no `max://` prefix) → ask current cwd context for child names

This routes through the same `MaxUrlResolver` infrastructure. Each level's `listWorkspaces()` / `listInstallations()` provides the names.

### Implementation

Deferred. The outcome is specified; the completer protocol for asking nodes "list your children" needs design when we build completions. The architecture supports it — `GlobalClient.listWorkspaces()` and `WorkspaceClient.listInstallations()` already exist.

---

## Implementation Order

```
Phase 1: Foundation
  ├─ ResolvedContext type
  ├─ CommandDef type + command registry
  └─ Context resolution (resolveContext, detectCwdContext)
  Files: resolved-context.ts, command-def.ts, command-registry.ts, resolve-context.ts

Phase 2: Two-phase dispatch
  ├─ Pre-parse extension (-t, -g)
  ├─ Rewrite execute() to two-phase flow
  └─ Gate command levels
  Files: index.ts (pre-parse + execute rewrite)

Phase 3: Migrate existing commands
  ├─ sync → CommandDef, installation-name addressing
  ├─ connect → CommandDef (workspace only)
  ├─ schema → CommandDef (workspace only)
  └─ init → CommandDef (level-independent)
  Files: commands/*.ts

Phase 4: New commands
  ├─ ls (global + workspace)
  ├─ status (global + workspace + installation)
  └─ Default bare `max` → status
  Files: commands/ls-command.ts, commands/status-command.ts

Phase 5: Display
  ├─ Context header in all level-aware commands
  ├─ URL column in ls output
  └─ JSON output with url field
  Files: commands/*.ts, printers/

Phase 6: Tab completion for -t (deferred)
  └─ Hierarchical completer for -t value
```

Phases 1–2 are foundational. Phase 3 is migration (can be incremental per-command). Phases 4–5 are new features. Phase 6 is deferred.

---

## Testing

### Context resolution (`packages/cli/src/__test__/resolve-context.test.ts`)

**cwd detection:**
- cwd inside `.max/` → workspace context
- cwd inside `.max/installations/hubspot-prod/` → installation context
- cwd with no `.max/` → global context

**Target resolution:**
- No target, workspace cwd → workspace context
- `-t hubspot-prod` at workspace cwd → installation context (relative)
- `-t max://~/other-ws` → workspace context (absolute)
- `-t ~` → global context
- `-g` → global context
- `-t` wins over `-g` wins over `MAX_TARGET` wins over cwd

**Errors:**
- `-t nonexistent` → `ErrTargetResolutionFailed`
- `-t hubspot-prod` at global cwd (no workspace to resolve against) → error

### Command gating (`packages/cli/src/__test__/command-gating.test.ts`)

- `sync` at global → `ErrCommandNotAtLevel` with hint
- `sync` at installation → passes gate
- `ls` at installation → `ErrCommandNotAtLevel`
- `status` at any level → passes gate
- Unknown command → different error (`ErrUnknownCommand`)

### Two-phase dispatch (integration)

- `max ls` in workspace dir → lists installations
- `max -g ls` → lists workspaces
- `max -t max://~/my-team/hubspot-prod status` → installation status
- `max sync hubspot-prod` in workspace dir → syncs installation
- `max sync` in installation dir → syncs (no arg needed)
- `max` (bare) → status output

---

## Summary

| Concept | Type | Where | Role |
|---------|------|-------|------|
| **ResolvedContext** | Discriminated union | `@max/cli` | Level + client + url, handed to every command |
| **CommandDef** | Interface | `@max/cli` | Declares name, levels, parser, handler |
| **resolveContext** | Function | `@max/cli` | cwd/env/flags → ResolvedContext via MaxUrlResolver |
| **detectCwdContext** | Function | `@max/cli` | cwd → workspace or installation detection |
| **-t / -g** | Global flags | Pre-parse | Override implicit cwd context |
| **gateCommand** | Function | Dispatch | Rejects commands at unsupported levels |

Commands don't know about targeting. They receive a `ResolvedContext` and operate at their natural level. The dispatch layer handles resolution, gating, and error messages. Display conventions ensure users always see the MaxUrl, building intuition for `-t` targeting.
