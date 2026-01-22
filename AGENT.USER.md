# Max CLI - Agent Usage Guide

Max is a data pipe CLI that syncs and queries data from various sources (Google Drive, Linear, etc.).

## Quick Reference

### Discover available fields

```bash
max schema <source>
```

Example:
```bash
max schema linear
max schema gdrive
```

This shows entity types and their filterable fields.

### Search for entities

```bash
max search <source> [options]
```

Options:
- `-t, --type <type>` - Filter by entity type (e.g., `issue`, `document`, `folder`)
- `--owner <email>` - Filter by owner
- `--name <pattern>` - Filter by name (glob pattern)
- `--path <pattern>` - Filter by path (glob pattern, gdrive)
- `--limit <n>` - Max results (default: 50)
- `--offset <n>` - Skip first n results
- `-o, --output json` - Output as JSON for parsing

Examples:
```bash
# Find Linear issues
max search linear --type=issue --limit=10

# Find Google Docs
max search gdrive --type=document --limit=5

# Search by name pattern
max search gdrive --name="*quarterly*" --type=spreadsheet

# Get JSON for parsing
max search linear --type=issue --limit=5 -o json
```

### Get a single entity

```bash
max get <source> <id> [options]
```

Options:
- `--content` - Include extracted content
- `-o, --output json` - Output as JSON

Example:
```bash
max get linear abc-123-def
max get gdrive 1BxiMVs0XRA5nFMdKvBd -o json
```

## Tips

1. Always check `max schema <source>` first to see available entity types
2. Use `-o json` when you need to parse the output programmatically
3. Entity types vary by source - Linear has `issue`, `project`, `comment`; gdrive has `file`, `folder`
