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
- `-f, --filter <field=value>` - Filter by field (repeatable)
- `--limit <n>` - Max results (default: 50)
- `--offset <n>` - Skip first n results
- `-o, --output json` - Output as JSON for parsing

Examples:
```bash
# Find Linear issues in a specific state
max search linear --type=issue --filter state="In Review"

# Filter by multiple fields
max search linear --type=issue --filter assignee="alice@example.com" --filter state="In Progress"

# Find Google Docs by owner
max search gdrive --type=document --filter owner="alice@example.com"

# Wildcard patterns - use * or ? for glob matching
max search linear --type=issue --filter "creator=*ben*"
max search gdrive --filter "name=*quarterly*"
max search gdrive --filter "path=/Reports/*"

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

1. Always check `max schema <source>` first to see available filterable fields
2. Use `-o json` when you need to parse the output programmatically
3. Entity types vary by source - Linear has `issue`, `project`, `comment`; gdrive has `file`, `folder`
4. Filter fields are validated against the schema - use `max schema` to see what's available
