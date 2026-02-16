# Spec: AppContext + Lazy ProjectContext

## Problem

The runner split (GlobalRunner/ProjectRunner) created two runners to avoid nullable DaemonConfig. This works but: (1) hides commands from help text outside a project, (2) duplicates runner logic, (3) doesn't reflect that the CLI is one tool with one context that may or may not have a project.

## Design

### Context hierarchy

```
AppContext extends Context          ← always available, global CLI concerns
  └─ ProjectContext extends AppContext  ← lazy, project-scoped
       connectors: ConnectorRegistry
       project: ProjectManager
```

`AppContext` replaces what was `DaemonContext`. Currently empty (no Context.instance fields), but future home for global command context (dev mode, etc. would live on CliContext, not here — see below).

`ProjectContext` holds what `DaemonContext` held: connectors + project manager.

### CliContext (CLI infrastructure)

Separate from the command context hierarchy. This is the CLI plumbing:

```typescript
class CliContext {
  readonly global: GlobalContext;       // printer, cliName, devMode
  private _project?: ProjectScope;      // lazy, memoised

  requireProject(): ProjectScope;       // throws if not in a project
}

interface GlobalContext {
  readonly printer: CliPrinter;
  readonly cliName: string;
}

interface ProjectScope {
  readonly config: DaemonConfig;
  readonly daemon: DaemonManager;
}
```

`CliContext` is constructed once at bootstrap. `requireProject()` lazily constructs DaemonConfig + DaemonManager from the `projectRoot` it was given. Throws if projectRoot is null.

### Single CommandRunner

One runner. Knows all commands. Shows all help.

- Receives `CliContext` + commands map + command context (`InferContext<Context>`)
- Help always lists everything
- Daemon commands (except list) call `this.cli.requireProject()` at execution time
- Regular commands go through `execute()` which passes the command context — if a project command's `run()` accesses `ctx.project` on an UninitializedProjectManager, it throws naturally
- `daemon list` calls static `DaemonManager.listAll()`

### Command declarations

```typescript
// Global command — doesn't need project
export const initCommand = Command.define({
  context: AppContext,   // ← was DaemonContext
  ...
});

// Project command — needs connectors, project manager
export const schemaCommand = Command.define({
  context: ProjectContext,  // ← was DaemonContext
  ...
});
```

### Bootstrap flow (index.ts)

```
1. Parse argv, resolve projectRoot
2. Build CliContext (global + lazy project)
3. Build command context:
   - If projectRoot: Context.build(ProjectContext, { connectors, project: FsProjectManager })
   - Else: Context.build(AppContext, {})
4. Build single CommandRunner(commands, commandCtx, cliContext)
5. Route: daemonized → socket server, else → runner.execute(argv)
```

## Files to change

| File | Change |
|------|--------|
| `packages/daemon/src/context.ts` | Rename DaemonContext → ProjectContext, add AppContext base class |
| `packages/daemon/src/commands/init.ts` | Change `context: DaemonContext` → `context: AppContext` |
| `packages/daemon/src/commands/schema.ts` | Change `context: DaemonContext` → `context: ProjectContext` |
| `packages/daemon/src/commands/connect.ts` | Change `context: DaemonContext` → `context: ProjectContext` |
| `packages/daemon/src/index.ts` | Update exports: AppContext, ProjectContext |
| `packages/cli/src/project-runner.ts` | DELETE (merge back into command-runner.ts) |
| `packages/cli/src/global-runner.ts` | DELETE |
| `packages/cli/src/command-runner.ts` | RECREATE — single CommandRunner with CliContext |
| `packages/cli/src/cli-context.ts` | CREATE — CliContext, GlobalContext, ProjectScope |
| `packages/cli/src/index.ts` | Simplified bootstrap, single runner |
| `packages/cli/src/socket.ts` | Already uses Runner interface, no change needed |
| `packages/cli/src/runner.ts` | Keep as-is (Runner interface, runToResponse, exitWith) |
| Any other files importing DaemonContext | Update to ProjectContext |

## Verification

1. `turbo run typecheck` passes
2. `max --help` shows all commands whether in project or not
3. `max init` works outside a project
4. `max daemon list` works from anywhere
5. `max sync` outside project gives clear error
6. `max daemon status` inside project works
7. No `config!` casts, no nullable DaemonConfig
8. No DaemonContext references remain
