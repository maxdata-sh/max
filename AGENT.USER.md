# Max CLI - Agent Usage Guide

Max is a data pipe CLI that syncs and queries data from various sources ({{SOURCES_LIST}}).

## Available Sources

{{SOURCES_SUMMARY}}

## Quick Reference

### Discover available fields

```bash
max schema <source>
```

Example:
```bash
{{SCHEMA_COMMANDS}}
```

This shows entity types and their filterable fields.

### Search for entities

```bash
max search <source> [options]
```

Options:
- `-t, --type <type>` - Filter by entity type
- `-f, --filter <field=value>` - Filter by field (repeatable)
- `--fields <field>` - Select fields to return (repeatable, JSON only)
- `--limit <n>` - Max results (default: 50)
- `--offset <n>` - Skip first n results
- `-o, --output json` - Output as JSON for parsing (see [JSON Pagination](#json-pagination))

### Filter syntax

Filters use `field=value` format. Wildcards are auto-detected:

| Pattern | Meaning |
|---------|---------|
| `field=value` | Exact match |
| `field=*value*` | Contains "value" |
| `field=value*` | Starts with "value" |
| `field=*value` | Ends with "value" |
| `field=va?ue` | Single character wildcard |

Wildcards use glob syntax (`*` = any chars, `?` = single char).

Examples:
```bash
{{SEARCH_EXAMPLES}}
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
{{GET_EXAMPLES}}
```

## JSON Pagination

When using `-o json`, the response includes pagination metadata:

```json
{
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total": 1234,
    "hasMore": true
  },
  "data": [
    { "id": "1", "type": "contact", ... },
    { "id": "2", "type": "contact", ... }
  ]
}
```

### Pagination fields

| Field | Description |
|-------|-------------|
| `offset` | Number of results skipped |
| `limit` | Maximum results requested |
| `total` | Total matching results |
| `hasMore` | `true` if more results exist |

### Fetching the next page

Use `--offset` to paginate through results:

```bash
# First page
max search hubspot --type=contact --limit 50 -o json

# Next page (offset = previous offset + limit)
max search hubspot --type=contact --limit 50 --offset 50 -o json
```

### Agent pagination pattern

```bash
# Loop until hasMore is false
OFFSET=0
LIMIT=50

while true; do
  RESULT=$(max search hubspot --type=contact --limit $LIMIT --offset $OFFSET -o json)
  # Process $RESULT...

  HAS_MORE=$(echo "$RESULT" | jq '.pagination.hasMore')
  if [ "$HAS_MORE" = "false" ]; then
    break
  fi
  OFFSET=$((OFFSET + LIMIT))
done
```

### Field selection

Use `--fields` to return only specific fields (reduces output size):

```bash
# Comma-separated
max search hubspot --type=contact --fields name,email,phone -o json

# Or repeatable
max search hubspot --type=contact --fields name --fields email -o json
```

Output with field selection:
```json
{
  "pagination": { ... },
  "data": [
    { "id": "1", "source": "hubspot", "type": "contact", "name": "Alice", "email": "alice@example.com" }
  ]
}
```

Note: `id`, `source`, and `type` are always included. Selected fields are flattened from `properties`.

## Tips

1. Always check `max schema <source>` first to see available filterable fields
2. Use `-o json` when you need to parse the output programmatically
3. Entity types vary by source:
{{ENTITY_TYPES_LIST}}
4. Filter fields are validated against the schema - use `max schema` to see what's available
