# @max/cli

The Max CLI package. Handles command parsing, daemon lifecycle, shell completion, and the Rust binary proxy.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Terminal                                                   │
│  $ max schema acme                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Rust Proxy                          rust-proxy/src/        │
│  Packages args as JSON, connects to daemon, relays messages │
│  Handles interactive prompting protocol                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ Unix socket (~/.max/daemons/<hash>/)
                           │ Bidirectional JSONL stream
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CLI                                 src/                   │
│  Optique command parsers, execution logic, socket server    │
└──────────────────────────┬──────────────────────────────────┘
                           │ CLI → MaxProjectApp / MaxGlobalApp
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  App                                 @max/app               │
│  Business logic, config, project management, connectors     │
└─────────────────────────────────────────────────────────────┘
```

## Rust Proxy

**Files:** `rust-proxy/src/main.rs`, `rust-proxy/src/daemon.rs`

The `max` binary is a small Rust program. It:

1. **Finds the project root** - walks up from cwd looking for `max.json` + `.max/`
2. **Packages args as JSON** - `max schema acme` becomes `{"kind":"run","argv":["schema","acme"],"cwd":"...","color":true}`
3. **Connects to the daemon** - tries the per-project Unix socket, spawns the daemon if needed
4. **Relays messages** - bidirectional JSONL loop handling `response`, `prompt`, and `write` messages
5. **Handles interactive prompting** - when the daemon sends a `prompt` message, the proxy reads from the real terminal and sends the input back

Two request kinds: `"run"` (normal commands) and `"complete"` (shell tab-completion).

**Bypass:** `daemon` subcommands always run direct (bypass the socket) since they manage the daemon itself.

**Dev mode:** When `MAX_DEV=1`, the daemon spawns with `bun --watch` for live reload.

### Per-Project Daemon Paths

Each project gets its own daemon directory under `~/.max/daemons/<hash>/` where `<hash>` is a SHA-256 prefix of the project root path. Contains: `daemon.sock`, `daemon.pid`, `daemon.log`, `project.json`.

### Running without the proxy
**Fallback:** If the daemon connection fails, the proxy runs Bun directly (`bun run src/index.ts --project-root <root> <args>`).  
You can always run the bun binary (either compiled or via src/index.ts) without the rust proxy.

## CLI (`src/`)

Commands are defined as [Optique](https://github.com/peterboyer/optique) parsers in `src/commands/`. To add a new command, create a parser in that directory and wire it into the `CLI` class in `src/index.ts`, which composes all commands into a single program parser and handles dispatch.

The CLI runs in two modes (same code path either way):

- **Daemon mode** (`--daemonized`): listens on the Unix socket, relays responses back as JSONL
- **Direct mode**: parses args, executes, writes to stdout/stderr, and exits

The socket protocol is bidirectional - the daemon can send `prompt` and `write` messages mid-command, and the proxy relays user input back. If your command needs interactive input, take a `Prompter` (see `src/prompter.ts`) - this works transparently in both direct and daemon mode.

Current commands: `schema`, `connect`, `init`, `daemon`.

### Lazy construction

App dependencies (`MaxProjectApp`, `MaxGlobalApp`) are wired up as lazily evaluated records - nothing is resolved until a command actually needs it. When adding new dependencies or commands, follow this pattern: declare the dependency in the lazy record and access it from your command handler. This keeps commands like `max init` fast (they never pay for project-scoped setup) and means errors like "no project found" only surface for commands that actually require a project.

## App (`@max/app`)

The business logic layer - config, project management, connectors, daemon lifecycle. The CLI depends on it but never contains domain logic itself. See [`packages/app/`](../app/) for details.

## Key Design Decisions

**Why a Rust proxy?**  
Instant startup - high throughput and snappy tab complete (~1ms). The Bun daemon stays warm in the background, so subsequent commands skip Bun's startup cost.

**Why bidirectional JSONL?**  
Simple framing with `\n` delimiters, and it supports a conversational protocol - the daemon can prompt for user input and the proxy relays between the terminal and the socket.

**Why `CliResponse` objects instead of direct stdout?**   
The daemon has no terminal attached. All output flows back as structured JSON over the socket to the Rust proxy, which writes to the real terminal.

**Why the fallback to direct mode?**  
Resilience. If the daemon is down, the CLI still works by running Bun inline.

**Why separate `@max/app` from `@max/cli`?**  
The CLI handles terminal concerns (parsing, formatting, prompting). The app layer owns business logic and can be used without a CLI (e.g. in tests, future server mode).
