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
- `-f, --filter <expr>` - Filter expression (e.g., "name=foo AND state=open")
- `--limit <n>` - Max results (default: 50)
- `--offset <n>` - Skip first n results
- `-o, --output json` - Output as JSON for parsing (see [JSON Pagination](#json-pagination))

### Filter syntax

Filters support boolean logic and grouping:

| Syntax | Meaning |
|--------|---------|
| `field=value` | Exact match |
| `field!=value` | Not equal |
| `field>value` | Greater than |
| `field>=value` | Greater than or equal |
| `field<value` | Less than |
| `field<=value` | Less than or equal |
| `field~=value` | Contains (substring match) |
| `field~=value*` | Starts with |
| `field~=*value` | Ends with |
| `field~=*value*` | Glob/wildcard match |

**Combinators:**
| Syntax | Meaning |
|--------|---------|
| `expr AND expr` | Both must match |
| `expr OR expr` | Either must match |
| `NOT expr` | Negation |
| `(expr)` | Grouping |

**Examples:**
```bash
# Simple equality
max search hubspot --type=contact --filter "email=john@example.com"

# Contains (substring match)
max search linear --type=issue --filter "title~=Mark"

# Wildcard match
max search gdrive --type=file --filter "name~=*report*"

# AND (both conditions)
max search linear --type=issue --filter "state=In Progress AND assignee=alice@example.com"

# OR (either condition)
max search hubspot --type=contact --filter "lifecycleStage=lead OR lifecycleStage=customer"

# Grouping with parentheses
max search linear --type=issue --filter "(state=Todo OR state=In Progress) AND priority>2"

# NOT (negation)
max search gdrive --type=file --filter "NOT owner=me@example.com"

# Complex combination
max search hubspot --type=deal --filter "(stage=closedwon OR stage=closedlost) AND amount>=10000"
```

**Important:** Always quote the filter string to prevent shell interpretation.

**Values with spaces:** Use quotes inside the filter for values containing spaces:
```bash
max search linear --filter "state=\"In Progress\""
max search linear --filter "title~=\"quarterly report\""
```

{{SEARCH_EXAMPLES}}

### Filter best practices for agents

1. **Start broad, then narrow:** Begin with a simple filter, then add conditions if too many results
2. **Use `~=` for text search:** When looking for entities by name/title, `~=` (contains) is usually what you want
3. **Combine type and filter:** Always specify `--type` when possible to reduce result set
4. **Check field names first:** Run `max schema <source>` to see valid filterable fields before constructing filters
5. **Use JSON output for parsing:** Always use `-o json` when you need to process results programmatically

**Common patterns:**
```bash
# Find issues assigned to someone
max search linear --type=issue --filter "assignee~=alice"

# Find open items
max search linear --type=issue --filter "state=Todo OR state=\"In Progress\""

# Find recent high-priority items
max search linear --type=issue --filter "priority>=3 AND state!=Done"

# Search by partial name
max search hubspot --type=contact --filter "firstName~=John"
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
LIMIT=500

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
