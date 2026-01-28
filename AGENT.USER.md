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
- `--limit <n>` - Max results (default: 50)
- `--offset <n>` - Skip first n results
- `-o, --output json` - Output as JSON for parsing

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

## Tips

1. Always check `max schema <source>` first to see available filterable fields
2. Use `-o json` when you need to parse the output programmatically
3. Entity types vary by source:
{{ENTITY_TYPES_LIST}}
4. Filter fields are validated against the schema - use `max schema` to see what's available
