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
- `-o, --output json` - Output as JSON for parsing

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

**Important:** Always quote the filter string when using `AND`, `OR`, `NOT`, or parentheses to prevent shell interpretation.

{{SEARCH_EXAMPLES}}

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

## Tips

1. Always check `max schema <source>` first to see available filterable fields
2. Use `-o json` when you need to parse the output programmatically
3. Entity types vary by source:
{{ENTITY_TYPES_LIST}}
4. Filter fields are validated against the schema - use `max schema` to see what's available
