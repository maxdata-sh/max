# Max CLI - Agent Usage Guide

Max is a data pipe CLI that syncs and queries data from various sources ({{SOURCES_LIST}}).

## How Max Works

Max mirrors data locally from external sources. When Max is integrated, data is fetched once and stored in a local SQLite database called a mirror. All subsequent queries run against this local copy.

**This means:**
- Queries are fast and free - no API calls, no rate limits
- Large result sets are fine - request 500 or 5000 results without worry
- You can iterate and explore without cost concerns

### Thinking in Max

Unlike direct API calls where you'd minimize requests, with Max you should:

1. **Count first, then query:** Before fetching data, check how much you're dealing with:
   ```bash
   # How many contacts total?
   max count hubspot --type=contact
   # Output: 98543

   # How many match my filter?
   max count hubspot --type=contact --filter "lifecycleStage=lead"
   # Output: 12301
   ```

   **Use count to decide your approach:**

   | Count | Approach |
   |-------|----------|
   | < 100 | Fetch directly, inspect results |
   | 100 - 10,000 | Fetch with `--all`, pipe to jq/scripts |
   | 10,000+ | Use `--all` with `--fields` to minimize data, or stream with ndjson |

2. **Use `--all` for complete data:** Don't guess limits; get all matching records:
   ```bash
   # Get ALL contacts (no limit)
   max search hubspot --type=contact --all --fields firstName -o ndjson 3>/dev/null
   ```

3. **Use `--fields` for token efficiency:** Only fetch the fields you need:
   ```bash
   # Instead of full entities with 20+ fields:
   max search hubspot --type=contact --limit 500 -o json

   # Fetch only what you need:
   max search hubspot --type=contact --limit 500 --fields firstName,lastName,email -o json
   ```

4. **Script for complex analysis:** For aggregations, joins across sources, or data transformations, pipe Max output to scripts:
   ```bash
   # Count contacts by lifecycle stage (use --all to get complete data)
   max search hubspot --type=contact --all --fields lifecycleStage -o ndjson 3>/dev/null \
     | jq -r '.lifecycleStage' | sort | uniq -c | sort -rn

   # Find top 10 contact first names
   max search hubspot --type=contact --all --fields firstName -o ndjson 3>/dev/null \
     | jq -r '.firstName' | grep -v '^$' | sort | uniq -c | sort -rn | head -10

   # Cross-source: find files mentioning top contacts
   TOP_NAMES=$(max search hubspot --type=contact --all --fields firstName -o ndjson 3>/dev/null \
     | jq -r '.firstName' | sort | uniq -c | sort -rn | head -5 | awk '{print $2}')
   for name in $TOP_NAMES; do
     echo "=== Files mentioning $name ==="
     max search gdrive --type=file --filter "name~=*$name*" --fields name,path
   done
   ```

5. **Iterate freely:** Run exploratory queries, refine filters, check counts - it's all local.

### When to use Max vs direct scripting

| Task | Approach |
|------|----------|
| Find specific entities | `max search` with filters |
| Get entity details | `max get <id>` |
| Count/aggregate data | Script with `jq`, `awk`, Python |
| Join across sources | Script piping multiple `max search` calls |
| Complex transformations | Python/Node script consuming Max JSON output |

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

### Count entities

```bash
max count <source> [options]
```

Options:
- `-t, --type <type>` - Filter by entity type
- `-f, --filter <expr>` - Filter expression

Outputs just a number (easy to capture in scripts):
```bash
max count hubspot --type=contact
# 98543

max count hubspot --type=contact --filter "lifecycleStage=lead"
# 12301
```

### Search for entities

```bash
max search <source> [options]
```

Options:
- `-t, --type <type>` - Filter by entity type
- `-f, --filter <expr>` - Filter expression (e.g., "name=foo AND state=open")
- `--all` - Return all results (no limit)
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

## NDJSON Output (Streaming)

Use `-o ndjson` for newline-delimited JSON output, ideal for streaming and piping to `jq`.

### Split streams (default)

By default, data records go to stdout and metadata goes to file descriptor 3:

```bash
# Data to stdout, metadata captured to file
max search hubspot --type=contact --limit 5 -o ndjson 3>meta.json | jq '.email'

# Ignore metadata, just process data
max search hubspot --type=contact --limit 5 -o ndjson 3>/dev/null | jq '.firstName'
```

Output (stdout):
```
{"id":"1","source":"hubspot","type":"contact","firstName":"Ben","lastName":"Smith","email":"ben@example.com"}
{"id":"2","source":"hubspot","type":"contact","firstName":"Alice","lastName":"Jones","email":"alice@example.com"}
```

Metadata (FD 3):
```json
{"_meta":{"pagination":{"offset":0,"limit":5,"total":1234,"hasMore":true}}}
```

The default limit is 50 if `--limit` is not specified.

If FD 3 isn't redirected, metadata is silently skipped.

### Merged stream (--merged-stream)

Use `--merged-stream` to write everything to stdout, with metadata as the last line:

```bash
max search hubspot --type=contact --limit 5 -o ndjson --merged-stream
```

Output:
```
{"id":"1","source":"hubspot","type":"contact","firstName":"Ben","lastName":"Smith","email":"ben@example.com"}
{"id":"2","source":"hubspot","type":"contact","firstName":"Alice","lastName":"Jones","email":"alice@example.com"}
{"_meta":{"pagination":{"offset":0,"limit":5,"total":1234,"hasMore":true}}}
```

### Field selection with NDJSON

Use `--fields` to include only specific fields:

```bash
max search hubspot --type=contact --limit 5 --fields firstName,email -o ndjson
```

Output:
```
{"id":"1","source":"hubspot","type":"contact","firstName":"Ben","email":"ben@example.com"}
{"id":"2","source":"hubspot","type":"contact","firstName":"Alice","email":"alice@example.com"}
```

Note: `id`, `source`, and `type` are always included.

### When to use NDJSON vs JSON

| Use case | Format |
|----------|--------|
| Pipe to jq for filtering/transformation | `-o ndjson` |
| Process large result sets line by line | `-o ndjson` |
| Need structured response with data array | `-o json` |
| Inspect pagination and data together | `-o json` |

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
5. **Don't be shy with limits** - data is local, so `--limit 500` or `--limit 5000` is fine
6. **Use `--fields`** to reduce output size and save tokens
7. **Pipe to scripts** for counting, aggregating, or joining data across sources
8. **Count before querying** - Use `max count` to understand data size before fetching
9. **Use `--all` for aggregations** - Don't guess limits; get complete data
10. **Prefer ndjson for piping** - Use `-o ndjson 3>/dev/null` when piping to jq
