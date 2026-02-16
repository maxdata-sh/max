# Handoff: Split CommandRunner into GlobalRunner + ProjectRunner

## Context

We refactored the daemon to be per-project (state under `~/.max/daemons/<hash>/`). This introduced `DaemonConfig | null` — config is null when outside a project. Currently we cast with `config!` in `packages/cli/src/index.ts` to avoid spreading nullability. This handoff eliminates that cast by splitting the runner.

## Goal

Split `CommandRunner` into two runners so `DaemonConfig` is never nullable:
- **GlobalRunner** — no project required, no DaemonConfig
- **ProjectRunner** — requires DaemonConfig + full DaemonContext

## Design

### Runner interface

Both implement:
```typescript
interface Runner {
  execute(argv: string[]): Promise<Response>;
  suggest(argv: string[]): Promise<readonly Suggestion[]>;
}
```

### GlobalRunner handles:
- `init` (and future global commands like registries, version)
- `--help` / no args (help text listing all commands)
- `completions <shell>` (shell completion scripts)
- `daemon list` (scans `~/.max/daemons/` globally, no config needed)

### ProjectRunner handles:
- All commands from the daemon command registry (`sync`, `connect`, `schema`, etc.)
- `daemon status/start/stop/enable/disable` (project-scoped, needs DaemonConfig)
- `--help` / no args should include both global AND project commands in help text

### Routing in index.ts

The split happens at the top of `index.ts`, BEFORE constructing runners:

```
argv = strip --project-root from process.argv

if --daemonized:
  // Always has project root (Rust shim guarantees it)
  config = new DaemonConfig({ projectRoot })
  projectRunner = ProjectRunner.create(commands, ctx, config)
  start socket server with projectRunner
else:
  // Route by command
  if argv[0] === "daemon" && argv[1] === "list":
    handle via DaemonManager.list() directly (or GlobalRunner)
  else if argv[0] === "daemon":
    need project root → build ProjectRunner → daemon subcommand
  else if projectRoot exists:
    build ProjectRunner → execute
  else:
    build GlobalRunner → execute (handles init, help, completions)
```

No `config!` cast needed — DaemonConfig is constructed only in branches where projectRoot exists.

### Completions / help when in a project

ProjectRunner should know about global commands too (for help text and tab completion). Options:
- ProjectRunner takes a reference to GlobalRunner and merges suggestions
- Or both runners contribute to a static command list used for help/suggestions

### daemon subcommand routing

`daemon list` → global (no config). All other daemon subcommands → project-scoped. The routing is a simple `argv[1]` check in `index.ts` before constructing any runner. This avoids splitting the Optique parser.

## Files to modify

- `packages/cli/src/index.ts` — main routing logic, construct appropriate runner
- `packages/cli/src/command-runner.ts` — becomes ProjectRunner (rename or extract)
- `packages/cli/src/global-runner.ts` — new file for GlobalRunner
- `packages/cli/src/daemon-manager.ts` — `list()` should work without config (already does — it scans `~/.max/daemons/` directly; just make it a static method or extract it)

## Files NOT to modify

- Rust shim — no changes needed
- `packages/daemon/` — no changes needed
- Command definitions — unchanged
- `socket.ts` — unchanged (daemon mode always uses ProjectRunner)

## Current state

Everything compiles (`cargo build` + `turbo run typecheck`). The `config!` cast is in `index.ts:39`. The DaemonManager already has `list()` that doesn't depend on project-specific config — it scans `~/.max/daemons/*/project.json` globally.

## Design note: Lazy context construction

There is a related but distinct question about whether DaemonContext dependencies (ProjectManager, future services) should be constructed eagerly or lazily.

**The tension:** Right now `index.ts` eagerly constructs everything — DaemonConfig, ConnectorRegistry, FsProjectManager, Context — before knowing which command will run. If any component fails to initialize, every command fails, even commands that don't need the failed component. As more context dependencies are added (databases, credential stores, external clients), this becomes increasingly fragile.

**The prior approach:** We previously had a `Lazy` field on DaemonConfig that deferred `findProjectRoot()` until first access. This was the right pattern (defer construction until consumption) but had the wrong inputs (it captured `process.cwd()` which was stale in daemon mode). We fixed the inputs but removed the deferral at the same time.

**Recommendation:** Consider reintroducing lazy construction at the *context* level, not on DaemonConfig (where inputs are now known upfront). The `DaemonContext` could hold lazy accessors so that a command which only reads `ctx.connectors` never triggers project manager construction and never hits "not a Max project" errors. This is orthogonal to the runner split — the split eliminates nullable DaemonConfig, while lazy context eliminates premature initialization failures.

This is not required for the runner split, but keep it in mind when wiring up the ProjectRunner's context construction. If you find yourself adding try/catch around eager construction, that's the signal to introduce laziness instead.

## Verification

1. `turbo run typecheck` passes
2. `max init` works outside a project (GlobalRunner)
3. `max daemon list` works from anywhere (global)
4. `max daemon status/start/stop` work inside a project (ProjectRunner)
5. `max sync`, `max connect`, `max schema` work inside a project (ProjectRunner)
6. `max --help` shows all commands when inside a project
7. No `as DaemonConfig` or `config!` casts remain
