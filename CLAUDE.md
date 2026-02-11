# Max CLI

A data pipe CLI that syncs and queries data from various sources (Google Drive, Linear, HubSpot etc).

## Tech Stack

- **Runtime:** Bun (NOT Node.js)
- **Language:** TypeScript
- **Database:** SQLite via `bun:sqlite`

## Commands

```bash
# Type checking (from worktree root)
turbo run typecheck

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

## Key Files

- `AGENT.USER.md` - Template for `llm-bootstrap` command output (uses `{{PLACEHOLDER}}` syntax)
- `.max/` - Project config directory (created by `max init`)
- `bun-test-project/` - Test project with `.max` directory for development

# Code Patterns
@CLAUDE.patterns.md

# How to think
@CLAUDE.thinking.md
