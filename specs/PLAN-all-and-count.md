# Add `--all` Flag and `max count` Command

## Problem

Agents are using arbitrary limits (e.g., 5000) instead of getting all data, leading to incorrect results for aggregations like "top 10 first names". Pagination is tedious to write correctly.

## Solution

1. **`--all` flag** - Stream all matching records without limit
2. **`max count` command** - Get count without fetching data
3. **Updated prompting** - Teach agents to count first, then decide approach

---

## Task 1: Add `max count` Command

**File:** `src/cli/commands/count.ts` (new file)

```typescript
import { object } from '@optique/core/constructs';
import { optional } from '@optique/core/modifiers';
import { argument, option, constant } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { message } from '@optique/core/message';
import { print, printError } from '@optique/run';
import { ConfigManager } from '../../core/config-manager.js';
import { ConnectorRegistry } from '../../core/connector-registry.js';
import { EntityStore } from '../../core/entity-store.js';
import { BasicFilterParser } from '../../core/filter/basic-parser.js';
import { sourceArg, entityTypeArg } from '../parsers.js';
import type { FilterExpr } from '../../types/filter.js';

export const countCommand = object({
  cmd: constant('count' as const),
  source: argument(sourceArg, { description: message`Source to count` }),
  type: optional(option('-t', '--type', entityTypeArg, { description: message`Filter by entity type` })),
  filter: optional(option('-f', '--filter', string(), { description: message`Filter expression` })),
});

export async function handleCount(opts: {
  source: string;
  type?: string;
  filter?: string;
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const registry = new ConnectorRegistry(config);
  const connector = await registry.get(opts.source);
  if (!connector) {
    printError(message`Unknown source: ${opts.source}`, { exitCode: 1 });
  }

  const allowedColumns = getFilterableFieldsFromSchema(connector.schema);

  let filterExpr: FilterExpr | undefined;
  if (opts.filter) {
    try {
      const parser = new BasicFilterParser();
      filterExpr = parser.parse(opts.filter, allowedColumns);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      printError(message`Invalid filter expression: ${errorMessage}`, { exitCode: 1 });
    }
  }

  const store = new EntityStore(config);
  await store.initialize();

  const count = await store.count({
    source: opts.source,
    type: opts.type,
    filterExpr,
    allowedColumns,
  });

  // Output just the number - easy to capture
  console.log(count);
}

function getFilterableFieldsFromSchema(schema: EntitySchema): string[] {
  const fields = new Set<string>();
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.filterable) {
        fields.add(field.name);
      }
    }
  }
  return Array.from(fields);
}
```

---

## Task 2: Add `count()` Method to EntityStore

**File:** `src/core/entity-store.ts`

```typescript
/**
 * Count entities matching query (without fetching data)
 */
async count(options: {
  source: string;
  type?: string;
  filterExpr?: FilterExpr;
  allowedColumns?: string[];
}): Promise<number> {
  if (!this.db) throw new Error('Database not initialized');

  let sql = 'SELECT COUNT(*) as count FROM entities WHERE source = ?';
  const params: unknown[] = [options.source];

  if (options.type) {
    sql += ' AND type = ?';
    params.push(options.type);
  }

  if (options.filterExpr && options.allowedColumns) {
    const renderer = new BasicSqlFilterRenderer((field) => `json_extract(properties, '$.${field}')`);
    const { sql: filterSql, params: filterParams } = renderer.render(options.filterExpr, options.allowedColumns);
    sql += ` AND (${filterSql})`;
    params.push(...filterParams);
  }

  const row = this.db.prepare(sql).get(...params) as { count: number };
  return row.count;
}
```

---

## Task 3: Add `--all` Flag to Search

**File:** `src/cli/commands/search.ts`

### 3.1 Add flag to command definition

```typescript
export const searchCommand = object({
  // ... existing options
  all: optional(option('--all', { description: message`Return all results (no limit)` })),
});
```

### 3.2 Update handler

```typescript
export async function handleSearch(opts: {
  // ... existing
  all?: boolean;
}) {
  // ...

  // Determine limit
  const limit = opts.all ? undefined : opts.limit;

  const result = await store.queryWithFilter({
    source: opts.source,
    type: opts.type,
    filterExpr,
    allowedColumns,
    limit,  // undefined = no limit
    offset: opts.all ? undefined : opts.offset,
  });

  // ... rest of handler
}
```

### 3.3 Update queryWithFilter to handle undefined limit

**File:** `src/core/entity-store.ts`

When `limit` is undefined, don't add LIMIT clause to SQL.

---

## Task 4: Register Count Command

**File:** `src/cli/index.ts`

```typescript
import { countCommand, handleCount } from './commands/count.js';

const parser = or(
  // ... existing commands
  command('count', countCommand, { description: message`Count entities matching a filter` }),
);

// In switch:
case 'count':
  await handleCount(result);
  break;
```

---

## Task 5: Update AGENT.USER.md Prompting

### 5.1 Add "Count First" guidance to "Thinking in Max" section

```markdown
### Strategy: Count first, then query

Before fetching data, check how much you're dealing with:

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

**Example workflow:**
```bash
# 1. Count first
max count hubspot --type=contact
# 98543

# 2. Since it's large, use --all with field selection and ndjson
max search hubspot --type=contact --all --fields firstName -o ndjson 3>/dev/null \
  | jq -r '.firstName' | sort | uniq -c | sort -rn | head -10
```
```

### 5.2 Update examples to use ndjson and --all

Replace json examples with ndjson where appropriate:

```markdown
3. **Script for complex analysis:** For aggregations, joins across sources, or data transformations, pipe Max output to scripts:
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
```

### 5.3 Add to Tips section

```markdown
8. **Count before querying** - Use `max count` to understand data size before fetching
9. **Use `--all` for aggregations** - Don't guess limits; get complete data
10. **Prefer ndjson for piping** - Use `-o ndjson 3>/dev/null` when piping to jq
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/cli/commands/count.ts` | Create | New count command |
| `src/cli/index.ts` | Edit | Register count command |
| `src/core/entity-store.ts` | Edit | Add `count()` method, handle undefined limit |
| `src/cli/commands/search.ts` | Edit | Add `--all` flag |
| `AGENT.USER.md` | Edit | Add count-first strategy, update examples to ndjson/--all |

---

## Testing Checklist

- [ ] `max count hubspot --type=contact` returns just a number
- [ ] `max count` works with `--filter`
- [ ] `max search --all` returns all results (no limit)
- [ ] `max search --all` works with ndjson streaming
- [ ] `max search --all --fields` returns only selected fields
- [ ] `--all` and `--limit` are mutually exclusive (or `--all` overrides)
- [ ] Large datasets (100k+) stream without memory issues

---

## Development Notes

- This is a Bun project, NOT npm/Node.js
- Type check: `bunx tsc --noEmit` (from worktree root)
- Test from `bun-test-project/`: `../max count hubspot --type=contact`
