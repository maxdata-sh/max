# DESIGN: CLI Targeting with Max URLs

> Pre-spec design exploration. Surfaces key tensions before committing to a spec.
> Iteration 2 — incorporates feedback on decisions and new tensions.

---

## The Model

Every `max` command executes **at a level** in the federation hierarchy. The level is determined by **context** — resolved before the command ever runs. The command simply operates on whatever client it's handed.

```
Level           Context gives you...        Commands at this level
──────────────  ──────────────────────────  ────────────────────────
Global          GlobalClient                ls → workspaces, status → all health, serve
Workspace       WorkspaceClient             ls → installations, status → installation health, search, serve
Installation    InstallationClient          sync, status → detail, search (narrowed), serve
```

---

## Context Resolution

Four layers, each overriding the last:

```
1. cwd-based       .max/ directory → workspace context
                    .max/installations/<name>/ → installation context (future)
2. env var          MAX_TARGET=max://~/my-team
3. -g flag          shorthand for max://~ (global)
4. -t flag          max -t max://~/my-team/hubspot sync
```

### Relative vs absolute

Any target that starts with `max://` is **absolute** — resolved from the global root.
Anything else is **relative** — resolved within the current implicit context.

```bash
# In a workspace dir:
max -t hubspot-prod sync           # relative: resolves within current workspace
max -t max://~/other-ws/hp sync    # absolute: fully qualified
max -t ~ sync                      # special: ~ is always global
```

### Where resolution happens

The global daemon (always running, managed by the Rust shim) performs context resolution before routing to the appropriate client. This keeps all resolution logic in Bun and stays fast — the daemon is persistent.

Flow:
```
Rust shim → global daemon → resolve context → route to {Global,Workspace,Installation}Client → execute command
```

The Rust shim can supply `-t` as part of the request, but the daemon owns resolution.

---

## Decided: Global Flag + Positional Compose

Both `-t` (flag) and positional arguments work. They compose naturally because context is resolved *before* the command runs:

```bash
max sync hubspot-prod                          # workspace from cwd, positional narrows to installation
max -t max://~/my-team sync hubspot-prod       # explicit workspace, positional narrows to installation
max -t max://~/my-team/hubspot-prod sync       # already at installation level — no positional needed
```

This isn't a "rule" — it's emergent. If `-t` resolves to installation, the command is already in installation context. A `sync` command at installation level doesn't need a positional because it already has its target.

---

## Decided: Installation-Name Addressing

**Breaking change.** Sync shifts from `max sync <connector> <name>` to `max sync <installation-name>`.

The installation name is assigned at `max connect` time. It's the user's chosen name for that instance.

```bash
max sync engineering              # installation named "engineering"
max sync hubspot-prod             # installation named "hubspot-prod"
```

No more connector-first addressing. The installation name is the stable identifier.

---

## Decided: `-g` for Global

`-g` is shorthand for `-t ~` / `-t max://~`. Familiar from `npm -g`.

```bash
max ls                    # workspace level (from cwd)
max -g ls                 # global level — lists workspaces
max -t ~ ls               # same thing, explicit
```

Both `ls` and `status` show a context header that tells you your current node and URL, so you can see where you are and choose a `-t` if needed:

```bash
$ max ls
 my-team (max://~/my-team)

  NAME             URL                              STATUS
  hubspot-prod     max://~/my-team/hubspot-prod     healthy
  linear-eng       max://~/my-team/linear-eng       syncing

$ max -g ls
 ~ (max://~)

  NAME             URL                    STATUS
  my-team          max://~/my-team        healthy (2 installations)
  staging          max://~/staging        degraded (1/3 healthy)
```

---

## Decided: Installation-Level cwd Detection

Today, only workspace-level context is detected (via `.max/` directory). But it would be surprising to stop there — if you're in an installation's data directory, you should get installation context.

```
project/
├── max.json
├── .max/                          ← workspace context
│   ├── installations/
│   │   ├── hubspot-prod/          ← installation context
│   │   └── linear-eng/            ← installation context
```

When cwd is inside `.max/installations/<name>/`, the implicit context resolves to that installation. This makes `max sync` (no args) work when you're "inside" an installation.

This also opens the door for making installation directories non-hidden in the future.

---

## Decided: Sync Safety

`max sync` at workspace level with no target: **reject**.

```
Error: sync requires an installation target.
  Use: max sync <installation-name>
  Or:  max sync --all --force   (syncs all installations)
```

`--all --force` is the escape hatch for "sync everything". Both flags required — this is a heavy operation.

---

## Decided: Bare `max` Shows Status

`max` with no command → `max status` at the current context level. If you want help, `max --help` / `max -h`.

---

## Display: URLs in Output

All listing and status commands show MaxUrls alongside names.

**Listings** — full URL column:
```
NAME             URL                              STATUS
hubspot-prod     max://~/my-team/hubspot-prod     healthy
```

**Status headers** — full URL in parens:
```
Workspace: my-team (max://~/my-team)
```

**JSON output** — always includes `url` field with full `max://` form.

Relative shorthand in prose where the context makes it obvious, but always include the full URL at least once so people can copy-paste it into `-t`.

---

## New Tension: Scope-Aware Command Definitions

Commands behave differently depending on the resolved level. Today, parsers are defined once and assume workspace context. With level-aware targeting, the same command (`ls`, `status`) has different argument shapes and completions at different levels.

### The problem

```typescript
// Today: one parser, assumes workspace
const lsCommand = command('ls', object({ cmd: constant('ls') }), { ... })

// With levels: ls at workspace shows installations, ls at global shows workspaces
// The parser is the same (no args) but the handler and completions differ
```

For `ls` and `status`, the parser shape is the same — no positional args. The *handler* adapts to the level. This is simple: switch on the resolved level in the handler.

But `sync` only makes sense at installation level. If you're at workspace level, sync needs a positional arg. If you're at installation level, it doesn't. The parser shape changes.

### Options

**A. One parser, optional positional.**
```typescript
const syncCommand = command('sync', object({
  cmd: constant('sync'),
  installation: optional(argument(installationCompleter, { ... })),
}))
```
The handler checks: if context is already installation-level, ignore the positional. If workspace-level, require it. Validation happens in the handler, not the parser.

Pros: Simple. One definition.
Cons: Parser can't enforce "required at workspace level, absent at installation level." Help text is ambiguous.

**B. Multiple parsers, selected by level.**
```typescript
const syncAtWorkspace = command('sync', object({
  cmd: constant('sync'),
  installation: argument(installationCompleter, { ... }),  // required
}))

const syncAtInstallation = command('sync', object({
  cmd: constant('sync'),
  // no positional
}))
```

The program selects which parser to use after context resolution.

Pros: Parser enforces level-appropriate args. Help text is precise.
Cons: More definitions. The parser selection happens after `-t` parsing but before command parsing — needs a two-phase parse.

**C. Parser factories parameterized by level.**
```typescript
const syncCommand = (level: MaxUrlLevel) => command('sync', object({
  cmd: constant('sync'),
  ...(level === 'workspace' ? {
    installation: argument(installationCompleter, { ... }),
  } : {}),
}))
```

Pros: Single source of truth with level-aware branching.
Cons: Conditional object spreads are fragile. Type inference gets hairy.

### Recommendation

**Option A for now.** Most commands don't change shape across levels — `ls`, `status`, `serve`, `search` all have the same parser at every level. Only `sync` has the "required at one level, absent at another" pattern. For sync, an optional positional with handler validation is pragmatic.

If more commands develop level-sensitive arg shapes, we graduate to Option B with a two-phase parse. But that's premature today.

---

## New Tension: Two-Phase Parse Architecture

Context resolution (parsing `-t` / `-g`) must happen *before* command parsing, because the resolved level determines which completers are valid. But the current architecture parses everything in one pass.

### Current flow
```
argv → @optique parser → fully parsed result → handler
```

### Required flow
```
argv → pre-parse (-t, -g, --help, daemon flags) → resolve context → command parser (with level-aware completers) → handler
```

### Precedent

There's already a pre-parse step for daemon flags in `cli/src/index.ts`. This is the natural place to extract `-t` and `-g`.

### Design sketch

```typescript
// Phase 1: extract global flags (already exists for daemon flags)
const { target, global: isGlobal, rest } = extractGlobalFlags(argv)

// Phase 2: resolve context
const resolved = resolveContext({ cwd, target, isGlobal, env })
// resolved: { level: MaxUrlLevel, client: GlobalClient | WorkspaceClient | InstallationClient, url: MaxUrl }

// Phase 3: parse command with level-aware completers
const completers = completersForLevel(resolved)
const parsed = await parseCommand(rest, completers)

// Phase 4: execute
await handler(parsed, resolved)
```

The key insight: completers (tab completion suggestions) depend on the resolved level. At workspace level, the installation completer suggests installation names. At global level, a workspace completer suggests workspace names. This is why context must resolve first.

---

## `-t` Parse Timing — Resolved

Pre-parse `-t` and `-g` in the existing daemon-flag extraction step. The global daemon resolves context, then routes to the appropriate command parser.

This keeps the @optique parser focused on command-specific args and avoids needing to thread `-t` through every command definition.

---

## Command Matrix (Final)

```
Command     Levels it works at         Positional at workspace      Positional at installation
──────────  ─────────────────────────  ───────────────────────────  ──────────────────────────
ls          global, workspace          (none)                       not supported
status      global, workspace, inst    [target?]                    (none)
sync        installation               <installation> (required)    (none — already targeted)
search      workspace, installation    <query>                      <query>
serve       global, workspace, inst    (none)                       (none)
connect     workspace                  <connector> [name]           N/A
schema      workspace                  <connector>                  N/A
init        (none — creates workspace) [directory]                  N/A
```

`status` at workspace level accepts an optional positional to drill into one installation without changing context. This is just a workspace-level command that takes a child name — no `-t` required.

---

## Decided: Command Level Introspection

Commands must declare which levels they support. This is required so the system can distinguish "command not supported at this level" from "command doesn't exist":

```bash
$ max -g sync
Error: "sync" is not available at global level.
  sync operates at: installation
  Current context: max://~
  Hint: max -t <installation> sync

$ max -g frobnicate
Error: Unknown command "frobnicate".
```

This means command registration needs a `levels` property:

```typescript
{
  name: 'sync',
  levels: ['installation'],
  // ...parser, handler
}

{
  name: 'ls',
  levels: ['global', 'workspace'],
  // ...
}

{
  name: 'status',
  levels: ['global', 'workspace', 'installation'],
  // ...
}
```

The dispatch layer checks `levels` before attempting to parse or run. This is lightweight metadata — not a whole new abstraction.

---

## Decided: Tab Completion for `-t`

The completer for `-t` walks the hierarchy as you type, asking each node for its children:

```bash
max -t max://~/          → suggests workspace names (ask GlobalMax)
max -t max://~/my-team/  → suggests installation names (ask WorkspaceMax)
max -t hub<TAB>          → suggests installation names matching "hub" (relative, ask current workspace)
```

This is architecturally straightforward — route the completion request to the right node based on how many segments are present. Implementation details deferred to when we tackle completions.

---

## Open Questions (Remaining)

1. **`ls` at installation level.** Not supported for now. The natural thing to show would be the health of any downstream clients the installation uses — but this needs its own design pass.

2. **Tab completion implementation.** The outcome is specified above. The protocol for asking a node "what are your children?" for completion purposes needs design when we build it.
