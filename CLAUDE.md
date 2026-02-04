# Max CLI

A data pipe CLI that syncs and queries data from various sources (Google Drive, Linear, HubSpot).

## Tech Stack

- **Runtime:** Bun (NOT Node.js)
- **Language:** TypeScript
- **Database:** SQLite via `bun:sqlite`
- **CLI Framework:** @optique/core, @optique/run

## Commands

```bash
# Type checking (from worktree root)
bunx tsc --noEmit

# Build (from worktree root)
bun run build
```

## Testing

Test from `bun-test-project/` which has a `.max` folder:

```bash
cd bun-test-project
../max <command>
```

The `max` binary is at the worktree root.

## Project Structure

```
src/
├── cli/                 # CLI commands and parsers
│   ├── commands/        # Individual command handlers
│   └── parsers.ts       # Argument parsers with completions
├── connectors/          # Data source integrations
│   ├── gdrive/          # Google Drive
│   ├── linear/          # Linear
│   └── hubspot/         # HubSpot
├── core/                # Core services
│   ├── entity-store.ts  # SQLite storage
│   ├── connector-registry.ts
│   └── config-manager.ts
└── types/               # TypeScript interfaces
```

## Adding Connectors

Each connector has 4 files:
- `index.ts` - Main class implementing `Connector` interface
- `schema.ts` - Entity schema (types, fields, relationships)
- `auth.ts` - Authentication logic
- `content.ts` - Content extraction (optional)

Register new connectors in `src/core/connector-registry.ts`.

## Key Files

- `AGENT.USER.md` - Template for `llm-bootstrap` command output (uses `{{PLACEHOLDER}}` syntax)
- `.max/` - Project config directory (created by `max init`)
- `bun-test-project/` - Test project with `.max` directory for development

# How to think
@CLAUDE.thinking.md
