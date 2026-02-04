# NDJSON Output Format

## Problem

When piping large JSON arrays to tools like `jq`, the stream can break mid-buffer because `jq` waits for the complete JSON array before processing. This prevents true streaming.

## Solution

Add `ndjson` (newline-delimited JSON) output format where each line is a complete JSON object:

```
{"_meta":{"pagination":{"offset":0,"limit":50,"total":1234,"hasMore":true}}}
{"id":"1","source":"hubspot","type":"contact","firstName":"Ben","lastName":"Blob"}
{"id":"2","source":"hubspot","type":"contact","firstName":"Stuart","lastName":"Ding"}
```

This allows:
- Line-by-line streaming processing
- `jq` can process records as they arrive
- `head -n 100` works correctly
- Easy to `grep`, `wc -l`, etc.

---

## Task 1: Update Output Format Types

**File:** `src/cli/output.ts`

### 1.1 Update OutputFormat type

```typescript
export type OutputFormat = 'text' | 'json' | 'ndjson';
```

### 1.2 Add NDJSON rendering in `renderEntities`

```typescript
export function renderEntities(
  entities: StoredEntity[],
  format: OutputFormat,
  formatEntity: (entity: StoredEntity) => string,
  pagination?: PaginationInfo,
  fields?: string[]
): string {
  if (format === 'ndjson') {
    const lines: string[] = [];

    // First line: metadata
    const meta = {
      _meta: {
        pagination: pagination ? {
          offset: pagination.offset,
          limit: pagination.limit,
          total: pagination.total,
          hasMore: pagination.offset + entities.length < pagination.total,
        } : null,
      },
    };
    lines.push(JSON.stringify(meta));

    // Subsequent lines: one entity per line
    for (const entity of entities) {
      const record = fields
        ? pickFields(entity, fields)
        : flattenEntity(entity);
      lines.push(JSON.stringify(record));
    }

    return lines.join('\n');
  }

  if (format === 'json') {
    // ... existing JSON logic
  }

  // ... existing text logic
}
```

### 1.3 Helper functions

```typescript
function flattenEntity(entity: StoredEntity): Record<string, unknown> {
  return {
    id: entity.id,
    source: entity.source,
    type: entity.type,
    ...entity.properties,
  };
}

function pickFields(entity: StoredEntity, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: entity.id,
    source: entity.source,
    type: entity.type,
  };
  for (const field of fields) {
    if (field in entity.properties) {
      result[field] = entity.properties[field];
    }
  }
  return result;
}
```

---

## Task 2: Update CLI Parsers

**File:** `src/cli/parsers.ts`

### 2.1 Update output format choice

```typescript
// Before:
export const outputFormat = choice(['text', 'json'] as const);

// After:
export const outputFormat = choice(['text', 'json', 'ndjson'] as const);
```

---

## Task 3: Update Search Command Types

**File:** `src/cli/commands/search.ts`

Update the output type:

```typescript
export async function handleSearch(opts: {
  source: string;
  type?: string;
  filter?: string;
  limit: number;
  offset: number;
  output?: 'text' | 'json' | 'ndjson';  // Add ndjson
  fields: readonly (readonly string[])[];
}) {
  // ...
}
```

---

## Task 4: NDJSON Default Behavior and `--merged-stream` Flag

**Key design:** For `ndjson` output, the default splits data and metadata:
- **stdout:** Data records only (one per line)
- **FD 3:** Metadata (pagination info)

This is the intended usage. Agents should redirect FD 3 if they want metadata:
```bash
max search hubspot -o ndjson 3>meta.json
```

For simpler cases where splitting isn't needed, `--merged-stream` puts everything on stdout with metadata **last**.

**File:** `src/cli/commands/search.ts`

### 4.1 Add `--merged-stream` option

```typescript
export const searchCommand = object({
  // ... existing options
  mergedStream: optional(option('--merged-stream', { description: message`Output metadata to stdout instead of FD 3 (ndjson only)` })),
});
```

### 4.2 Update handler for split output (default for ndjson)

```typescript
import * as fs from 'fs';

export async function handleSearch(opts: {
  // ... existing
  mergedStream?: boolean;
}) {
  // ... existing logic ...

  if (format === 'ndjson') {
    const meta = {
      _meta: {
        pagination: pagination ? {
          offset: pagination.offset,
          limit: pagination.limit,
          total: adjustedTotal,
          hasMore: pagination.offset + filteredEntities.length < adjustedTotal,
        } : null,
      },
    };

    // Output data records to stdout
    for (const entity of filteredEntities) {
      const record = fields
        ? pickFields(entity, fields)
        : flattenEntity(entity);
      console.log(JSON.stringify(record));
    }

    if (opts.mergedStream) {
      // Metadata last on stdout
      console.log(JSON.stringify(meta));
    } else {
      // Default: metadata to FD 3
      try {
        const metaStream = fs.createWriteStream('', { fd: 3 });
        metaStream.write(JSON.stringify(meta) + '\n');
        metaStream.end();
      } catch (err) {
        // FD 3 not open - silently skip metadata
        // (user didn't redirect 3>file)
      }
    }
    return;
  }

  // ... rest of json/text handling unchanged
}
```

### 4.3 Helper functions

**File:** `src/cli/output.ts`

```typescript
export function flattenEntity(entity: StoredEntity): Record<string, unknown> {
  return {
    id: entity.id,
    source: entity.source,
    type: entity.type,
    ...entity.properties,
  };
}

export function pickFields(entity: StoredEntity, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: entity.id,
    source: entity.source,
    type: entity.type,
  };
  for (const field of fields) {
    if (field in entity.properties) {
      result[field] = entity.properties[field];
    }
  }
  return result;
}
```

---

## Task 5: Update Documentation

**File:** `AGENT.USER.md`

### 4.1 Update options list

```markdown
Options:
- `-t, --type <type>` - Filter by entity type
- `-f, --filter <expr>` - Filter expression
- `--limit <n>` - Max results (default: 50)
- `--offset <n>` - Skip first n results
- `-o, --output <format>` - Output format: `text`, `json`, or `ndjson`
- `--fields <fields>` - Fields to include (comma-separated)
```

### 4.2 Add NDJSON section

```markdown
### NDJSON Output (Streaming)

Use `-o ndjson` for streaming-friendly output where each line is valid JSON:

```bash
max search hubspot --type=contact --limit 1000 -o ndjson
```

Output format:
```
{"_meta":{"pagination":{"offset":0,"limit":1000,"total":5432,"hasMore":true}}}
{"id":"1","source":"hubspot","type":"contact","firstName":"Ben","lastName":"Blob"}
{"id":"2","source":"hubspot","type":"contact","firstName":"Stuart","lastName":"Ding"}
...
```

**First line:** Metadata with pagination info (identified by `_meta` key)
**Subsequent lines:** One record per line

**Why NDJSON?**
- Streams correctly to `jq` without buffering issues
- Works with `head`, `tail`, `grep`, `wc -l`
- Each line can be processed independently

### Default: Split Output (Data to stdout, Metadata to FD 3)

By default, `ndjson` splits output:
- **stdout:** Data records only
- **FD 3:** Metadata (pagination)

```bash
# Capture metadata separately
max search hubspot --type=contact -o ndjson 3>meta.json

# stdout has only data - pipe directly to jq
max search hubspot --type=contact -o ndjson 3>meta.json | jq '.firstName'

# Ignore metadata entirely
max search hubspot --type=contact -o ndjson 3>/dev/null | jq '.email'
```

**Why split by default?**
- stdout contains only data - no need to skip/filter metadata
- Metadata captured separately for pagination logic
- Clean pipelines without `tail -n +2` hacks

**Example workflow:**
```bash
# Search with metadata captured
max search hubspot --type=contact --limit 1000 -o ndjson 3>meta.json > contacts.ndjson

# Check if there are more results
jq '._meta.pagination.hasMore' meta.json

# Process data
cat contacts.ndjson | jq -r '.email'
```

### Merged Stream (`--merged-stream`)

For simpler cases, use `--merged-stream` to output everything to stdout. Metadata appears as the **last line**:

```bash
max search hubspot --type=contact -o ndjson --merged-stream
```

Output:
```
{"id":"1","source":"hubspot","type":"contact","firstName":"Ben"}
{"id":"2","source":"hubspot","type":"contact","firstName":"Stuart"}
{"_meta":{"pagination":{"offset":0,"limit":50,"total":1234,"hasMore":true}}}
```

**Processing merged stream:**
```bash
# Get all lines except last (data only)
max search hubspot -o ndjson --merged-stream | head -n -1 | jq '.firstName'

# Get just metadata (last line)
max search hubspot -o ndjson --merged-stream | tail -1 | jq '._meta.pagination.total'
```
```

### 4.3 Update scripting examples in "Thinking in Max" section

Update examples to use `ndjson` where appropriate:

```bash
# Count contacts by lifecycle stage (streaming)
max search hubspot --type=contact --limit 10000 --fields lifecycleStage -o ndjson \
  | tail -n +2 | jq -r '.lifecycleStage' | sort | uniq -c | sort -rn
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/cli/output.ts` | Edit | Add `ndjson` format handling, add `renderEntitiesDataOnly()` |
| `src/cli/parsers.ts` | Edit | Add `ndjson` to output format choices |
| `src/cli/commands/search.ts` | Edit | Add `--meta-fd` option, handle split output |
| `AGENT.USER.md` | Edit | Document NDJSON format, `--meta-fd` flag, and usage patterns |

---

## Output Format Comparison

| Format | Use Case | Structure |
|--------|----------|-----------|
| `text` | Human reading | Formatted multi-line display |
| `json` | Programmatic access, small results | `{ "pagination": {...}, "data": [...] }` |
| `ndjson` | Streaming, large results, piping | One JSON object per line |

---

## Testing Checklist

- [ ] `max search <source> -o ndjson` outputs data records to stdout (one per line)
- [ ] `max search <source> -o ndjson 3>meta.json` writes metadata to meta.json
- [ ] Without FD 3 redirect, metadata is silently discarded (no error)
- [ ] `--fields` works with ndjson output
- [ ] Output pipes correctly to `jq` without buffering issues
- [ ] Large result sets (1000+) stream without memory issues
- [ ] `--merged-stream` outputs everything to stdout
- [ ] With `--merged-stream`, metadata is the **last** line (not first)
- [ ] `--merged-stream` only affects ndjson (not json/text)
- [ ] `tail -1 | jq '._meta'` extracts metadata from merged stream

---

## Development Notes

- **This is a Bun project, NOT npm/Node.js**
- Type check: `bunx tsc --noEmit` (from worktree root)
- Test from `bun-test-project/` directory which has a `.max` folder
- Run commands with `../max <command>` from within `bun-test-project/`
