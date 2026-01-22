# Max - Data Pipe CLI

**Fat pipe beats thin straw.**

Max is a CLI tool that syncs data from SaaS tools (starting with Google Drive) into a local data store, enabling powerful queries with permission controls.

## Quick Start

```bash
# Initialize a new project
npx tsx src/cli/index.ts init my-project
cd my-project

# Connect Google Drive (requires OAuth setup - see below)
npx tsx src/cli/index.ts connect gdrive

# Sync all data
npx tsx src/cli/index.ts sync gdrive

# Search for documents
npx tsx src/cli/index.ts search gdrive --type=document

# View permissions on a file
npx tsx src/cli/index.ts permissions gdrive "/path/to/file"
```

## Installation

```bash
cd max
npm install
```

## Google Drive Setup

To connect to Google Drive, you need to create OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Enable the Google Drive API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Add `http://localhost:3847/oauth2callback` to authorized redirect URIs
6. Set environment variables:
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   ```

## Commands

### `max init [directory]`

Initialize a new Max project. Creates the `.max/` directory structure.

### `max connect <source>`

Connect to a data source. Currently supports:
- `gdrive` - Google Drive

### `max sync <source>`

Sync all data from the source into the local store.

### `max schema <source>`

Display the entity schema for a source.

```bash
max schema gdrive
# Shows available fields and relationships
```

### `max search <source> [options]`

Search entities with filters.

```bash
# Search by type
max search gdrive --type=document

# Search by owner
max search gdrive --owner=user@example.com

# Search by path pattern
max search gdrive --path="/Finance/*"

# Combine filters
max search gdrive --type=document --owner=user@example.com

# JSON output
max search gdrive --output=json
```

### `max get <source> <id>`

Get details for a single entity.

```bash
max get gdrive abc123
max get gdrive abc123 --content  # Include extracted content
```

### `max permissions <source> <path>`

Show permissions for an entity by path.

```bash
max permissions gdrive "/Finance/Reports/Q4.gdoc"
```

### `max rules list`

List all loaded permission rules.

### `max rules apply <file>`

Apply a rules file.

```bash
max rules apply my-rules.yaml
```

### `max rules remove <name>`

Remove a rule by name.

## Permission Rules

Rules are defined in YAML files and can be placed in `.max/rules/` or applied via `max rules apply`.

```yaml
rules:
  - name: hide-board-docs
    deny:
      path: "/Board/*"

  - name: hide-hr-compensation
    deny:
      path: "/HR/Compensation/*"

  - name: restrict-by-owner
    deny:
      owner: "*@external.com"
```

### Rule Matching

- `path`: Glob pattern matching file/folder paths
- `owner`: Email pattern (supports `*` wildcards)
- `type`: Entity type (`file` or `folder`)

Rules are processed in order. Deny rules filter out matching entities from search results.

## Project Structure

```
.max/
├── config.yaml           # Project configuration
├── credentials/
│   └── gdrive.json       # OAuth tokens (gitignored)
├── store/
│   ├── entities.db       # SQLite metadata store
│   └── content/
│       └── gdrive/       # Extracted text content
├── rules/
│   └── *.yaml            # Permission rules
└── logs/
    └── sync.log          # Sync history
```

## Supported Content Extraction

Max extracts text content from:

- Google Docs (exported as plain text)
- Google Sheets (exported as CSV, first sheet only)
- Plain text files (.txt, .md, .json, .yaml, etc.)

**Not supported (v1):**
- PDFs
- Binary files (images, videos)
- Google Slides

## Development

```bash
# Type check
npm run typecheck

# Run CLI in dev mode
npm run dev -- <command>

# Build for production
npm run build
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Max CLI                                │
├─────────────────────────────────────────────────────────────────┤
│  Command Router  │  Output Renderer  │  Config Manager          │
├─────────────────────────────────────────────────────────────────┤
│              Core Modules                                       │
│  Connector Registry  │  Entity Store  │  Permissions Engine     │
├─────────────────────────────────────────────────────────────────┤
│  Google Drive Connector  │  SQLite Store  │  Rules (YAML)       │
└─────────────────────────────────────────────────────────────────┘
```

## Limitations (v1)

- Single connector (Google Drive only)
- No incremental sync (full sync each time)
- No free-text content search
- Simple path-based permission rules (no identity-aware filtering)
- PDF content extraction not supported

## Future Plans (v1.5+)

- Mirroring (subset of data for specific agents)
- Identity-aware permissions (`--as=agent-name`)
- Additional connectors (Slack, Notion, etc.)
- Free-text and semantic search
- Audit/diff commands

## License

MIT
