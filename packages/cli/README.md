# @max/cli

The Max CLI package. Handles command routing, daemon lifecycle, shell completion, and the Rust binary shim.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Terminal                                                    │
│  $ max schema acme                                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Rust Binary Shim              cli/src/             │
│  Parses args, connects to daemon, forwards JSON, prints      │
└──────────────────────────┬──────────────────────────────────┘
                           │ Unix socket (configurable via DaemonConfig)
                           │ JSON over newline-delimited stream
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Bun Daemon                    src/                 │
│  Socket server, Optique CLI parsing, command dispatch         │
└──────────────────────────┬──────────────────────────────────┘
                           │ CommandRunner → execute()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Daemon Commands               @max/daemon          │
│  Command definitions, param validation, business logic        │
└─────────────────────────────────────────────────────────────┘
```

## Layer 1: Rust Binary Shim

**Files:** `cli/src/main.rs`, `cli/src/daemon.rs`

The `max` binary is a small Rust program. It:

1. **Packages args as JSON** — `max schema acme` becomes `{"kind":"run","argv":["schema","acme"]}`
2. **Connects to the daemon** — tries the Unix socket, spawns the daemon if needed (20 retries, 50ms backoff)
3. **Sends the request** — newline-delimited JSON over the socket
4. **Prints the response** — writes stdout/stderr from the JSON response, exits with the response code

Two request kinds: `"run"` (normal commands) and `"complete"` (shell tab-completion).

**Fallback:** If the daemon connection fails, the shim runs Bun directly (`bun run index.ts <args>`). The CLI always works.

**Dev mode:** When `MAX_DEV=1`, the daemon spawns with `bun --watch` for live reload. Daemon stderr goes to the log file (see DaemonConfig).

## Layer 2: Bun Daemon

### Entry Point — `src/index.ts`

Creates `DaemonConfig`, `ConnectorRegistry`, `DaemonContext`, and `CommandRunner`. Runs in two modes:

- **Daemon mode** (`--daemonized`): starts the socket server via `createSocketServer()`
- **Direct mode**: calls `runner.execute(argv)` and exits

Both modes use the same `CommandRunner`.

### Socket Server — `src/socket.ts`

`Bun.listen()` on the Unix socket with per-connection JSONL buffering. Dispatches to `CommandRunner.execute()` or `CommandRunner.suggest()` depending on request kind.

### CommandRunner — `src/command-runner.ts`

The central router. Takes `CommandDef` objects from `@max/daemon` and auto-generates [Optique](https://github.com/peterboyer/optique) parsers from their `ParamDef` metadata via the parser bridge.

Uses Optique's `runParserAsync` harness for parsing, which provides `--help` handling and error formatting for free. Output is captured into `Response` objects (since the daemon has no terminal attached).

**Meta-commands** (daemon, completions) are defined as Optique parsers in `src/meta-commands.ts`. Daemon lifecycle is handled by `DaemonManager` (`src/daemon-manager.ts`).

### Parser Bridge — `src/parser-bridge.ts`

Converts `@max/daemon` `ParamDef` metadata into Optique parsers:

| ParamDef                              | Optique parser                          |
|---------------------------------------|-----------------------------------------|
| `Param.string({ required: true })`    | Positional argument                     |
| `Param.string()`                      | Optional flag (`--name value`)          |
| `Param.boolean()`                     | Flag with no value (`--json`)           |
| Any param with `oneOf`                | Async `ValueParser` with tab-completion |

### Configuration — `src/config.ts`

`DaemonConfig` holds all daemon configuration (file paths, dev mode, etc.) and is threaded through the call chain. Reads from environment variables with `MAX_` prefix:

- `MAX_DEV` — enables watch mode
- `MAX_DAEMON_TMP` — overrides the tmp directory for socket/pid/log files

## Layer 3: Daemon Commands (`@max/daemon`)

Commands are defined using the Type + Companion Object pattern:

```typescript
export const schemaCommand = Command.define({
    name: "schema",
    desc: "Show entity schema for a connector",
    context: DaemonContext,
    params: {
        source: Param.string({
            required: true,
            oneOf: Param.oneOf({
                values: (ctx) => ctx.connectors.list().map(e => e.name),
            }),
        }),
        json: Param.boolean({ desc: "Output as JSON" }),
    },
    async run({ source, json }, ctx) { ... },
});
```

Params are defined once and automatically get CLI parsing, validation, tab-completion, and help text.

## Complete Trace: `max schema acme`

```
Terminal
  │  $ max schema acme
  ▼
Rust Shim (main.rs)
  │  req = { kind: "run", argv: ["schema", "acme"] }
  │  → connect to /tmp/max-daemon.sock (spawn if needed)
  │  → write JSON + newline
  ▼
Socket Server (socket.ts)
  │  Buffer data → parse JSONL → extract request
  ▼
CommandRunner.execute(["schema", "acme"])
  │  → runParserAsync(schemaParser, "max schema", ["acme"])
  │  → { source: "acme" }
  ▼
daemon/execute(schemaCommand, { source: "acme" }, ctx)
  │  ✓ validate required params
  │  ✓ validate oneOf constraints
  │  → schemaCommand.run({ source: "acme" }, ctx)
  ▼
Response: { stdout: "...schema output...", exitCode: 0 }
  │  → socket.write(JSON.stringify(response))
  │  → socket.end()
  ▼
Rust Shim (main.rs)
  │  → print stdout, exit(0)
  ▼
Terminal
  │  ...schema output printed...
```

## Key Design Decisions

**Why a Rust shim?** Instant startup (~1ms). The Bun daemon stays warm in the background, so subsequent commands skip Bun's startup cost.

**Why newline-delimited JSON?** Simple framing. The `\n` byte signals "request complete" — no content-length headers needed.

**Why the parser bridge?** Commands define params once in `@max/daemon` and get CLI parsing, validation, completion, and help for free. No duplication.

**Why Response objects instead of direct stdout?** The daemon runs with stdout/stderr piped to null. All output must flow back as structured JSON over the socket to the Rust shim, which writes to the real terminal.

**Why the fallback to direct mode?** Resilience. If the daemon is down, the CLI still works by running Bun inline.
