# Staging Implementation Plan

Implement the staging primitive for token-efficient data handoff between agents.

See `docs/ideas/staging-and-agent-orchestration.md` for full design rationale.

## Overview

Staging allows data to be stored with a short token reference, enabling efficient handoff between agents without passing large data through prompts.

```bash
# Stage data
TOKEN=$(max search hubspot --all -o ndjson | max stage)
# → max:a1b2c3d4

# Retrieve data
max retrieve max:a1b2c3d4

# List staged data
max stage list

# Get info
max stage info max:a1b2c3d4

# Cleanup
max unstage max:a1b2c3d4
```

---

## Task 1: Staging Infrastructure

**File:** `src/core/staging.ts` (new)

### 1.1 Token Generation

```typescript
// Generate a short, unique token
function generateToken(): string
// Returns: "a1b2c3d4" (8 hex chars from random bytes)

// Full token with prefix
function formatToken(id: string): string
// Returns: "max:a1b2c3d4"

// Parse token (strips prefix if present)
function parseToken(token: string): string
// "max:a1b2c3d4" → "a1b2c3d4"
// "a1b2c3d4" → "a1b2c3d4"
```

### 1.2 Storage Functions

```typescript
interface StagedData {
  token: string;
  createdAt: string;      // ISO timestamp
  expiresAt: string;      // ISO timestamp
  recordCount: number;    // Number of lines/records
  byteSize: number;       // Size in bytes
  source?: string;        // Optional: source hint (hubspot, gdrive, etc.)
  contentType: 'ndjson' | 'json' | 'text';
}

// Get staging directory, create if needed
function getStagingDir(maxDir: string): string
// Returns: .max/staging/

// Stage data from a readable stream
async function stageData(
  maxDir: string,
  input: ReadableStream | NodeJS.ReadableStream,
  options?: { source?: string; ttlMinutes?: number }
): Promise<{ token: string; metadata: StagedData }>

// Read staged data metadata
function getStagedMetadata(maxDir: string, token: string): StagedData | null

// Check if staged data exists
function stagedDataExists(maxDir: string, token: string): boolean

// Get path to staged data file
function getStagedDataPath(maxDir: string, token: string): string

// Delete staged data
function unstageData(maxDir: string, token: string): boolean

// List all staged data
function listStagedData(maxDir: string): StagedData[]

// Cleanup expired staging
function cleanupExpiredStaging(maxDir: string): number
```

### 1.3 Storage Format

Each staged item consists of two files:
```
.max/staging/
  a1b2c3d4.ndjson      # The actual data
  a1b2c3d4.meta.json   # Metadata
```

Metadata file:
```json
{
  "token": "a1b2c3d4",
  "createdAt": "2024-01-28T12:00:00Z",
  "expiresAt": "2024-01-28T13:00:00Z",
  "recordCount": 98543,
  "byteSize": 12400000,
  "source": "hubspot/contact",
  "contentType": "ndjson"
}
```

### 1.4 Default TTL

```typescript
const DEFAULT_STAGING_TTL_MINUTES = 60; // 1 hour
```

---

## Task 2: CLI Command - `max stage`

**File:** `src/cli/commands/stage.ts` (new)

Reads from stdin, stages data, outputs token.

### 2.1 Command Definition

```typescript
export const stageCommand = object({
  cmd: constant('stage' as const),
  ttl: optional(option('--ttl', integer({ min: 1 }), {
    description: message`Time-to-live in minutes (default: 60)`
  })),
  source: optional(option('--source', string(), {
    description: message`Source hint (e.g., hubspot/contact)`
  })),
});
```

### 2.2 Handler

```typescript
export async function handleStage(opts: {
  ttl?: number;
  source?: string;
}) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  // Read from stdin
  const { token, metadata } = await stageData(
    config.getMaxDir(),
    process.stdin,
    { ttlMinutes: opts.ttl, source: opts.source }
  );

  // Output just the token
  console.log(formatToken(token));
}
```

### 2.3 Usage

```bash
# Basic
max search hubspot --all -o ndjson | max stage
# Output: max:a1b2c3d4

# With options
cat data.json | max stage --ttl 120 --source "custom/data"
# Output: max:x7y8z9
```

---

## Task 3: CLI Command - `max retrieve`

**File:** `src/cli/commands/retrieve.ts` (new)

Outputs staged data to stdout.

### 3.1 Command Definition

```typescript
export const retrieveCommand = object({
  cmd: constant('retrieve' as const),
  token: argument(string(), { description: message`Staging token (e.g., max:a1b2c3d4)` }),
});
```

### 3.2 Handler

```typescript
export async function handleRetrieve(opts: { token: string }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const tokenId = parseToken(opts.token);
  const dataPath = getStagedDataPath(config.getMaxDir(), tokenId);

  if (!stagedDataExists(config.getMaxDir(), tokenId)) {
    printError(message`Staged data not found: ${opts.token}`, { exitCode: 1 });
  }

  // Stream file to stdout
  const fileStream = fs.createReadStream(dataPath);
  fileStream.pipe(process.stdout);
}
```

### 3.3 Usage

```bash
max retrieve max:a1b2c3d4
# Streams data to stdout

max retrieve max:a1b2c3d4 | jq '.firstName' | head -10
# Pipe to processing
```

---

## Task 4: CLI Command - `max stage list`

**File:** `src/cli/commands/stage-list.ts` (new) or extend `stage.ts`

Lists all staged data.

### 4.1 Command Definition

```typescript
export const stageListCommand = object({
  cmd: constant('stage' as const),
  subCmd: constant('list' as const),
  output: optional(option('-o', '--output', oneOf(['text', 'json'] as const), {
    description: message`Output format`
  })),
});
```

### 4.2 Handler

```typescript
export async function handleStageList(opts: { output?: 'text' | 'json' }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  // Cleanup expired first
  cleanupExpiredStaging(config.getMaxDir());

  const staged = listStagedData(config.getMaxDir());

  if (opts.output === 'json') {
    console.log(JSON.stringify(staged, null, 2));
    return;
  }

  // Text output
  if (staged.length === 0) {
    console.log('No staged data.');
    return;
  }

  for (const item of staged) {
    const age = formatAge(item.createdAt);
    const expires = formatTimeRemaining(item.expiresAt);
    const size = formatBytes(item.byteSize);
    console.log(
      `max:${item.token}  ${item.recordCount.toLocaleString()} records  ${size}  ${item.source || 'unknown'}  ${age} ago  expires: ${expires}`
    );
  }
}
```

### 4.3 Usage

```bash
max stage list
# max:a1b2c3d4  98,543 records  12.4 MB  hubspot/contact  2 min ago  expires: 58 min
# max:x7y8z9       847 records  94.2 KB  gdrive/file      5 min ago  expires: 55 min

max stage list -o json
# [{"token": "a1b2c3d4", "recordCount": 98543, ...}]
```

---

## Task 5: CLI Command - `max stage info`

**File:** `src/cli/commands/stage-info.ts` (new) or extend `stage.ts`

Shows details about specific staged data.

### 5.1 Command Definition

```typescript
export const stageInfoCommand = object({
  cmd: constant('stage' as const),
  subCmd: constant('info' as const),
  token: argument(string(), { description: message`Staging token` }),
  output: optional(option('-o', '--output', oneOf(['text', 'json'] as const), {
    description: message`Output format`
  })),
});
```

### 5.2 Handler

```typescript
export async function handleStageInfo(opts: { token: string; output?: 'text' | 'json' }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const tokenId = parseToken(opts.token);
  const metadata = getStagedMetadata(config.getMaxDir(), tokenId);

  if (!metadata) {
    printError(message`Staged data not found: ${opts.token}`, { exitCode: 1 });
  }

  if (opts.output === 'json') {
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  // Text output with preview
  console.log(`Token:      max:${metadata.token}`);
  console.log(`Records:    ${metadata.recordCount.toLocaleString()}`);
  console.log(`Size:       ${formatBytes(metadata.byteSize)}`);
  console.log(`Source:     ${metadata.source || 'unknown'}`);
  console.log(`Created:    ${formatAge(metadata.createdAt)} ago`);
  console.log(`Expires:    ${formatTimeRemaining(metadata.expiresAt)}`);
  console.log(`Type:       ${metadata.contentType}`);
  console.log('');
  console.log('Preview:');

  // Show first 3 lines
  const dataPath = getStagedDataPath(config.getMaxDir(), tokenId);
  const preview = await readFirstLines(dataPath, 3);
  for (const line of preview) {
    console.log(`  ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
  }
  if (metadata.recordCount > 3) {
    console.log(`  ... (${metadata.recordCount - 3} more)`);
  }
}
```

### 5.3 Usage

```bash
max stage info max:a1b2c3d4
# Token:      max:a1b2c3d4
# Records:    98,543
# Size:       12.4 MB
# Source:     hubspot/contact
# Created:    2 min ago
# Expires:    58 min
# Type:       ndjson
#
# Preview:
#   {"id":"1","source":"hubspot","type":"contact","firstName":"John",...}
#   {"id":"2","source":"hubspot","type":"contact","firstName":"Sarah",...}
#   {"id":"3","source":"hubspot","type":"contact","firstName":"Mike",...}
#   ... (98540 more)
```

---

## Task 6: CLI Command - `max unstage`

**File:** `src/cli/commands/unstage.ts` (new)

Deletes staged data.

### 6.1 Command Definition

```typescript
export const unstageCommand = object({
  cmd: constant('unstage' as const),
  token: argument(string(), { description: message`Staging token to delete` }),
});
```

### 6.2 Handler

```typescript
export async function handleUnstage(opts: { token: string }) {
  const config = ConfigManager.find();
  if (!config) {
    printError(message`Not in a Max project. Run "max init" first.`, { exitCode: 1 });
  }

  const tokenId = parseToken(opts.token);
  const deleted = unstageData(config.getMaxDir(), tokenId);

  if (!deleted) {
    printError(message`Staged data not found: ${opts.token}`, { exitCode: 1 });
  }

  console.log(`Unstaged: max:${tokenId}`);
}
```

### 6.3 Usage

```bash
max unstage max:a1b2c3d4
# Unstaged: max:a1b2c3d4
```

---

## Task 7: Register Commands

**File:** `src/cli/index.ts` (or wherever commands are registered)

Add the new commands to the CLI parser.

---

## Task 8: Auto-cleanup Integration

Call `cleanupExpiredStaging()` opportunistically in frequently-used commands (search, count) similar to how pagination state cleanup works.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/core/staging.ts` | Create | Core staging utilities |
| `src/cli/commands/stage.ts` | Create | `max stage` command |
| `src/cli/commands/retrieve.ts` | Create | `max retrieve` command |
| `src/cli/commands/stage-list.ts` | Create | `max stage list` command |
| `src/cli/commands/stage-info.ts` | Create | `max stage info` command |
| `src/cli/commands/unstage.ts` | Create | `max unstage` command |
| `src/cli/index.ts` | Edit | Register new commands |

---

## Testing Checklist

- [ ] `echo "test" | max stage` creates staged data, outputs token
- [ ] `max retrieve <token>` outputs staged data
- [ ] `max stage list` shows all staged data with metadata
- [ ] `max stage list -o json` outputs JSON
- [ ] `max stage info <token>` shows detailed info with preview
- [ ] `max unstage <token>` deletes staged data
- [ ] Expired staging is auto-cleaned
- [ ] Invalid token errors are clear
- [ ] Works with large files (streaming, not loading into memory)
- [ ] Token format is `max:xxxxxxxx`
- [ ] Staging directory is `.max/staging/`

---

## Usage Examples

### Basic staging workflow

```bash
# Stage search results
TOKEN=$(max search hubspot --type=contact --all --fields firstName -o ndjson | max stage)
echo "Staged contacts at: $TOKEN"

# Process staged data
max retrieve $TOKEN | jq -r '.firstName' | sort | uniq -c | sort -rn | head -10

# Check what's staged
max stage list

# Cleanup when done
max unstage $TOKEN
```

### Agent handoff pattern

```bash
# Orchestrating agent stages data
CONTACTS=$(max search hubspot --all -o ndjson | max stage --source hubspot/contact)

# Passes token to subagent in prompt:
# "Contacts are at max:a1b2c3d4. Find top 10 companies."

# Subagent retrieves and processes
max retrieve max:a1b2c3d4 | jq -r '.company' | sort | uniq -c | sort -rn | head -10
```
