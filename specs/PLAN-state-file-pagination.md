# State File Pagination

## Rationale

The current ndjson output uses file descriptor 3 (FD 3) to separate metadata from data:
```bash
max search hubspot --type=contact -o ndjson 3>meta.json
```

This design is problematic for LLM agents, which struggle to issue shell commands with `3>` redirection. Most agent frameworks don't support custom file descriptor redirection, making pagination metadata inaccessible.

We need a simpler mechanism that:
1. Works with standard CLI patterns (flags and files)
2. Doesn't require shell magic
3. Provides just-in-time hints when pagination is needed
4. Lets agents paginate without planning ahead

## Background

### Current state

- `max search` outputs data to stdout, metadata to FD 3 (ndjson mode)
- `--merged-stream` flag puts metadata as last line of stdout (workaround)
- `max count` returns total count, helps agents estimate result size
- `--all` flag fetches everything without pagination
- Agents are guided to count first, then decide approach

### The remaining problem

When an agent needs to paginate (data too large for single fetch), they need:
1. A way to get pagination metadata without FD 3
2. A way to continue from where they left off
3. Ideally, just-in-time discovery when they underestimate result size

### Design principles

1. **Query-agnostic state files** - State files track position only, not query params. Query is always provided at call site.
2. **JIT pagination discovery** - Agent runs a normal search; if more results exist, stderr hints at continuation.
3. **Validation via hash** - State file stores hash of query params to detect mismatched continuations.
4. **LLM-friendly** - Full query visible in each command (easier to reason about than implicit state).

## Plan

### Task 1: State file infrastructure

**File:** `src/core/pagination-state.ts` (new)

Create utilities for managing pagination state files.

#### 1.1 State file schema

```typescript
interface PaginationState {
  version: 1;
  createdAt: string;        // ISO timestamp
  source: string | null;    // For filename; null if virgin state
  offset: number;           // Current position (0 for virgin)
  total: number | null;     // Total matching results; null if virgin
  hasMore: boolean | null;  // Convenience flag; null if virgin
  queryHash: string | null; // SHA256 of query params; null until first use
}
```

**Virgin state:** A state file created via `max search --init` before any query is known. Fields `source`, `total`, `hasMore`, and `queryHash` are null. On first use with an actual search, these fields are populated and the query hash is locked in.

#### 1.2 Core functions

```typescript
// Generate hash from query params (for validation)
function hashQueryParams(params: {
  source: string;
  type?: string;
  filter?: string;
  limit: number;
}): string;

// Generate state file path
function generateStateFilePath(configDir: string, source: string | null): string;
// Returns: .max/state/<timestamp>-<source|'virgin'>-<hash>.json

// Create virgin state file (no query params yet)
function createVirginStateFile(configDir: string): string;  // Returns path

// Create state file with known query params
function createStateFile(
  configDir: string,
  params: { source: string; type?: string; filter?: string; limit: number },
  total: number,
  offset?: number  // defaults to 0
): string;  // Returns path

// Read state file
function readStateFile(path: string): PaginationState | null;

// Update state file after search
function updateStateFile(
  path: string,
  state: Partial<PaginationState>
): void;

// Delete state file
function deleteStateFile(path: string): void;

// Check if state is virgin (no query hash yet)
function isVirginState(state: PaginationState): boolean;
```

#### 1.3 State directory

Create `.max/state/` directory on first use. Add to `.gitignore` template in `max init`.

---

### Task 2: Update search command

**File:** `src/cli/commands/search.ts`

#### 2.1 Add new options

```typescript
export const searchCommand = object({
  // ... existing options
  init: option('--init', {
    description: message`Create a virgin state file and exit (outputs path)`
  }),
  state: optional(option('--state', string(), {
    description: message`Continue pagination from state file`
  })),
  close: optional(option('--close', string(), {
    description: message`Delete state file and exit`
  })),
});
```

#### 2.2 Handle `--init` flag

If `--init` is provided, create a virgin state file and output its path. No search performed.

```typescript
if (opts.init) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const statePath = createVirginStateFile(config.configDir);
  console.log(statePath);
  return;
}
```

The virgin state file contains:
```json
{
  "version": 1,
  "createdAt": "2024-01-28T12:00:00Z",
  "source": null,
  "offset": 0,
  "total": null,
  "hasMore": null,
  "queryHash": null
}
```

#### 2.3 Handle `--close` flag

If `--close` is provided, delete the state file and exit (no search performed).

```typescript
if (opts.close) {
  deleteStateFile(opts.close);
  return;
}
```

#### 2.4 Handle `--state` flag in search

When `--state` is provided:

1. Read state file
2. If virgin (queryHash is null), lock in the query hash
3. If not virgin, validate query params match (via hash)
4. Use `state.offset` as the starting offset (ignore `--offset` flag)
5. After search, update state file with new offset, total, hasMore

```typescript
if (opts.state) {
  const state = readStateFile(opts.state);
  if (!state) {
    printError(message`State file not found: ${opts.state}`, { exitCode: 1 });
  }

  const queryHash = hashQueryParams({
    source: opts.source,
    type: opts.type,
    filter: opts.filter,
    limit: opts.limit
  });

  if (state.queryHash === null) {
    // Virgin state - lock in the query hash on first use
    state.queryHash = queryHash;
    state.source = opts.source;
    // offset stays at 0, total/hasMore will be set after search
  } else if (queryHash !== state.queryHash) {
    printError(message`Query params don't match state file. Use a new state or match the original query.`, { exitCode: 1 });
  }

  // Use offset from state
  offset = state.offset;
}
```

#### 2.4 JIT state file creation (ndjson/json only)

After search completes, if `hasMore` is true and no `--state` was provided:

1. Create a new state file
2. Print hint to stderr

```typescript
if (format === 'ndjson' || format === 'json') {
  const hasMore = pagination && pagination.offset + filteredEntities.length < pagination.total;

  if (hasMore && !opts.state) {
    // JIT: create state file for continuation
    const statePath = createStateFile(
      config.configDir,
      { source: opts.source, type: opts.type, filter: opts.filter, limit: opts.limit },
      pagination.total,
      pagination.offset + filteredEntities.length  // next offset
    );
    console.error(`More results (${filteredEntities.length} of ${pagination.total}). Continue: --state=${statePath}`);
  } else if (hasMore && opts.state) {
    // Update existing state file
    updateStateFile(
      opts.state,
      pagination.offset + filteredEntities.length,
      pagination.total
    );
    console.error(`More results (${pagination.offset + filteredEntities.length} of ${pagination.total}). Continue: --state=${opts.state}`);
  } else if (opts.state) {
    // Complete - could auto-delete or leave for explicit --close
    console.error(`Complete (${pagination?.total ?? filteredEntities.length} results).`);
  }
}
```

#### 2.5 Remove FD 3 logic

Remove `tryWriteToFd3()` function and all FD 3 writes. The `--merged-stream` flag can remain for backwards compatibility or be deprecated.

---

### Task 3: Update count command

**File:** `src/cli/commands/count.ts`

#### 3.1 Add state file to JSON output (threshold-based)

When count exceeds a threshold (2000), include a state file in JSON output.

```typescript
const PAGINATION_THRESHOLD = 2000;

if (format === 'json') {
  const output: { count: number; stateFile?: string } = { count };

  if (count > PAGINATION_THRESHOLD) {
    const statePath = createStateFile(
      config.configDir,
      { source: opts.source, type: opts.type, filter: opts.filter, limit: 50 },
      count,
      0  // start at beginning
    );
    output.stateFile = statePath;
  }

  console.log(JSON.stringify(output));
}
```

#### 3.2 Add hint to text output

For text output, add a hint line when count is large:

```typescript
if (format === 'text') {
  console.log(count);

  if (count > PAGINATION_THRESHOLD) {
    const statePath = createStateFile(/* ... */);
    console.error(`Hint: Use --state=${statePath} for paginated search`);
  }
}
```

---

### Task 4: Update documentation

**File:** `AGENT.USER.md`

#### 4.1 Remove FD 3 documentation

Remove all references to `3>meta.json` and FD 3 redirection.

#### 4.2 Add state file pagination section

```markdown
### Pagination with State Files

When search results exceed your limit, Max creates a state file for continuation:

```bash
max search hubspot --type=contact --limit=500 -o ndjson
# stdout: 500 records
# stderr: More results (500 of 12500). Continue: --state=.max/state/1706xxx-hubspot-a1b2.json
```

Continue fetching:
```bash
max search hubspot --type=contact --limit=500 --state=.max/state/1706xxx-hubspot-a1b2.json -o ndjson
# stdout: next 500 records
# stderr: More results (1000 of 12500). Continue: --state=...
```

Repeat until complete:
```bash
# stderr: Complete (12500 results).
```

Clean up when done (optional):
```bash
max search --close=.max/state/1706xxx-hubspot-a1b2.json
```

**Proactive pagination from count:**

```bash
max count hubspot --type=contact -o json
# {"count": 12500, "stateFile": ".max/state/1706xxx-hubspot-a1b2.json"}

# Use state file from the start
max search hubspot --type=contact --limit=500 --state=.max/state/1706xxx-hubspot-a1b2.json -o ndjson
```

**Pre-create state file (for scripting):**

```bash
# Create a virgin state file before knowing the query
state=$(max search --init)
# Output: .max/state/1706xxx-virgin-a1b2.json

# Use it with any query - first use locks in the query params
max search gdrive --type=file --filter='size>0' --limit=500 --state=$state -o ndjson

# Subsequent calls must use the same query params
max search gdrive --type=file --filter='size>0' --limit=500 --state=$state -o ndjson
```
```

#### 4.3 Update "Thinking in Max" section

Update the count-based decision table to mention state files:

```markdown
| Count | Approach |
|-------|----------|
| < 2,000 | Fetch with `--all`, inspect results |
| 2,000 - 20,000 | Use `--all` with `--fields`, or paginate with state file |
| 20,000+ | Paginate with state file, process in batches |
```

---

### Task 5: State file auto-cleanup

**File:** `src/core/pagination-state.ts`

#### 5.1 Cleanup function

```typescript
const STATE_FILE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanupStaleStateFiles(configDir: string): number {
  const stateDir = path.join(configDir, 'state');
  if (!fs.existsSync(stateDir)) return 0;

  const now = Date.now();
  let cleaned = 0;

  for (const file of fs.readdirSync(stateDir)) {
    const filePath = path.join(stateDir, file);
    const state = readStateFile(filePath);
    if (state) {
      const createdAt = new Date(state.createdAt).getTime();
      if (now - createdAt > STATE_FILE_TTL_MS) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }
  }

  return cleaned;
}
```

#### 5.2 Trigger cleanup opportunistically

Run cleanup at the start of `max search` or `max count` (non-blocking, silent):

```typescript
// At start of handleSearch/handleCount
cleanupStaleStateFiles(config.configDir);
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/core/pagination-state.ts` | Create | State file management utilities |
| `src/cli/commands/search.ts` | Edit | Add `--init`, `--state`, `--close`, JIT state creation, remove FD 3 |
| `src/cli/commands/count.ts` | Edit | Add state file to output when count is large |
| `AGENT.USER.md` | Edit | Document state file pagination, remove FD 3 references |
| `templates/.gitignore` (if exists) | Edit | Add `.max/state/` |

---

## Testing Checklist

- [ ] `max search --init` creates virgin state file and outputs path
- [ ] Virgin state file has null queryHash, source, total, hasMore
- [ ] First use of virgin state locks in queryHash and source
- [ ] `max search ... -o ndjson` without `--state` creates state file when hasMore
- [ ] stderr shows continuation hint with state file path
- [ ] `max search ... --state=<path>` continues from correct offset
- [ ] Query param mismatch with state file produces clear error
- [ ] `max search --close=<path>` deletes state file
- [ ] `max count ... -o json` includes stateFile when count > threshold
- [ ] State files are created in `.max/state/` directory
- [ ] Stale state files (>24h) are cleaned up
- [ ] `--all` flag still works (no state file created)
- [ ] FD 3 writes are removed (no more `3>` needed)

---

## Migration Notes

- `--merged-stream` can be kept for backwards compatibility but is no longer needed
- Existing scripts using `3>` will silently stop receiving metadata (FD 3 writes removed)
- Document the change in release notes

---

## Example Agent Loops

### JIT pagination (discover state file as you go)

```bash
#!/bin/bash
# Example: Process all contacts in batches

QUERY="max search hubspot --type=contact --limit=500 -o ndjson"
STATE=""

while true; do
  if [ -n "$STATE" ]; then
    OUTPUT=$($QUERY --state="$STATE" 2>&1)
  else
    OUTPUT=$($QUERY 2>&1)
  fi

  # Separate stdout (data) from stderr (status)
  DATA=$(echo "$OUTPUT" | grep -v "^More results\|^Complete")
  STATUS=$(echo "$OUTPUT" | grep "^More results\|^Complete")

  # Process data...
  echo "$DATA" | jq '.email'

  # Check if done
  if echo "$STATUS" | grep -q "^Complete"; then
    break
  fi

  # Extract state file path for next iteration
  STATE=$(echo "$STATUS" | sed -n 's/.*--state=\([^ ]*\).*/\1/p')
done

# Cleanup
[ -n "$STATE" ] && max search --close="$STATE"
```

### Pre-initialized state (know you'll paginate)

```bash
#!/bin/bash
# Example: Pre-create state file for controlled pagination

STATE=$(max search --init)

while true; do
  # Query params provided each time (first call locks them in)
  max search hubspot --type=contact --limit=500 --state="$STATE" -o ndjson >> data.ndjson 2>status.txt

  # Check status
  if grep -q "^Complete" status.txt; then
    break
  fi
done

max search --close="$STATE"
```
