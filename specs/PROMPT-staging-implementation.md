# Prompt: Implement Staging for Max CLI

## Context

You're implementing a "staging" feature for Max, a data pipe CLI. Staging allows large data to be stored with a short token reference, enabling efficient handoff between AI agents without passing huge data payloads through prompts.

**Read these files first:**
- `PLAN-staging.md` — detailed implementation plan with code snippets
- `docs/ideas/staging-and-agent-orchestration.md` — design rationale and examples
- `CLAUDE.md` — project conventions (Bun runtime, TypeScript, etc.)

## What You're Building

Five new CLI commands:

```bash
# Stage data from stdin, output token
max search hubspot --all -o ndjson | max stage
# Output: max:a1b2c3d4

# Retrieve staged data to stdout
max retrieve max:a1b2c3d4

# List all staged data
max stage list

# Get detailed info about staged data
max stage info max:a1b2c3d4

# Delete staged data
max unstage max:a1b2c3d4
```

Plus the core staging infrastructure in `src/core/staging.ts`.

## Key Requirements

1. **Streaming** — Don't load entire files into memory. Use streams for staging and retrieval.

2. **Token format** — Short tokens like `max:a1b2c3d4` (prefix + 8 hex chars).

3. **Storage** — Files in `.max/staging/`:
   - `<token>.ndjson` (or `.json`, `.txt`) — the data
   - `<token>.meta.json` — metadata (size, record count, expiry, etc.)

4. **Auto-expiry** — Default 1 hour TTL. Expired files cleaned up opportunistically.

5. **Record counting** — Count newlines while staging to track record count.

6. **Source detection** — Try to infer source from data (look for `"source":` field in first record).

## Implementation Order

1. `src/core/staging.ts` — Core utilities first
2. `src/cli/commands/stage.ts` — The `max stage` command
3. `src/cli/commands/retrieve.ts` — The `max retrieve` command
4. `src/cli/commands/stage-list.ts` — List command
5. `src/cli/commands/stage-info.ts` — Info command
6. `src/cli/commands/unstage.ts` — Delete command
7. Register all commands in the CLI

## Testing

Test from `bun-test-project/` directory:

```bash
cd bun-test-project

# Test staging
echo '{"name":"test"}' | ../max stage
# Should output: max:xxxxxxxx

# Test retrieve
../max retrieve max:xxxxxxxx
# Should output: {"name":"test"}

# Test list
../max stage list

# Test info
../max stage info max:xxxxxxxx

# Test unstage
../max unstage max:xxxxxxxx

# Test with real data
../max search hubspot --type=contact --limit 10 -o ndjson | ../max stage
```

Type check: `bunx tsc --noEmit`

## Look at Existing Patterns

Check these files for patterns to follow:
- `src/core/pagination-state.ts` — similar file-based storage pattern
- `src/cli/commands/search.ts` — command structure and error handling
- `src/cli/commands/count.ts` — simpler command example

## Notes

- Use `crypto.randomBytes(4).toString('hex')` for token generation
- Use Bun's file APIs for streaming where possible
- The `printError` helper from `@optique/run` handles error output and exit codes
- Follow existing code style (see other commands)

## Deliverables

1. All files listed in the PLAN
2. Commands registered and working
3. Type-checking passes

Don't worry about updating documentation (AGENT.USER.md) — that will be done separately.
