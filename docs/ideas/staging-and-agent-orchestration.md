# Staging and Agent Orchestration

A design for token-efficient data handoff between agents using Max.

## The Problem

When an agent orchestrates complex multi-step data operations, the naive approach forces all intermediate data through the agent's context window:

```
Agent → Query HubSpot → 100k contacts in context → Process → Query GDrive →
  → 500 files in context → Process → Query content → ...
```

This is:
- **Expensive** — tokens scale with data volume
- **Fragile** — easy to blow context limits
- **Inefficient** — subagent prompts contain huge data payloads

**Bad pattern:**
```
"Hey subagent, please process these 100 files:
file1.doc, file2.doc, file3.doc, quarterly-report.xlsx,
meeting-notes-2024-01-15.doc, meeting-notes-2024-01-16.doc,
..." [2000 tokens of filenames]
```

**Good pattern:**
```
"Hey subagent, your files are at max:a1b2c3d4. Summarize them."
```

## The Solution: Staging

A simple primitive for data handoff via tokens.

### Core Operations

| Command | Purpose |
|---------|---------|
| `max stage` | Pipe data in, get token out |
| `max retrieve <token>` | Token in, data out |
| `max stage list` | Show all staged data |
| `max stage info <token>` | Inspect specific staged data |
| `max unstage <token>` | Explicit cleanup |

### Basic Usage

```bash
# Stage search results
TOKEN=$(max search hubspot --type=contact --all -o ndjson | max stage)
# Output: max:a1b2c3d4

# Later, retrieve
max retrieve max:a1b2c3d4
# Streams the original ndjson

# Or pipe to processing
max retrieve max:a1b2c3d4 | jq '.firstName' | sort | uniq -c

# Check what's staged
max stage list
# max:a1b2c3d4  98543 records  hubspot/contact  2 min ago   expires: 1h
# max:x7y8z9    847 records    gdrive/file      5 min ago   expires: 1h

# Get details
max stage info max:a1b2c3d4
# Token:    max:a1b2c3d4
# Records:  98,543
# Size:     12.4 MB
# Source:   hubspot/contact
# Created:  2 min ago
# Expires:  58 min
# Preview:  {"id":"1","firstName":"John",...}
#           {"id":"2","firstName":"Sarah",...}
#           ...

# Explicit cleanup (optional — auto-expires)
max unstage max:a1b2c3d4
```

### Token Format

Short, readable tokens: `max:a1b2c3d4`

- Prefix `max:` makes them greppable/identifiable
- 8 character hash is short enough for prompts
- Collision-resistant for practical purposes

### Storage

Staged data lives in `.max/staging/<token>.ndjson` (or similar).

- **Auto-expiry**: Default 1 hour, configurable
- **Auto-cleanup**: Stale files cleaned on next max operation
- **Inspectable**: Plain files, can debug manually

## Agent Orchestration Pattern

### The Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATING AGENT                       │
│                                                              │
│  Stages raw data ──────► Tokens ──────► Subagent prompts    │
│                                                              │
│  Receives insights ◄──── Direct ◄────── Subagent responses  │
│                          returns                             │
└─────────────────────────────────────────────────────────────┘
```

**Key principle: Stage data, return insights.**

| Type | How to pass |
|------|-------------|
| Raw data (100k records, file lists, document contents) | Stage it, pass token |
| Insights (summaries, decisions, proposals, short lists) | Return directly |

### Why This Split?

- **Data** is large, agent doesn't need to see all of it to orchestrate
- **Insights** are small, agent needs them to make decisions
- Subagent produces insight from data, returns insight, data stays staged

### Worked Example

**Task:** "Find top 10 companies by contact count, find related docs, propose blog posts for each."

```bash
# ================================================================
# ORCHESTRATING AGENT
# ================================================================

# Step 1: Stage all contacts (100k records — too big for context)
CONTACTS=$(max search hubspot --type=contact --all --fields company -o ndjson | max stage)
# → max:c1a2b3

# Step 2: Ask subagent to find top companies
# Note: passes TOKEN, not data
PROMPT="
Contacts are staged at: max:c1a2b3
Find top 10 companies by contact count.
Return as: Company Name (count)
"
# Subagent runs:
#   max retrieve max:c1a2b3 | jq -r '.company // empty' | sort | uniq -c | sort -rn | head -10
#
# Subagent RETURNS (directly, it's small):
#   Acme Corp (5,432)
#   Globex (3,211)
#   Initech (2,847)
#   ...

# Step 3: For each company, stage their docs
for company in "Acme Corp" "Globex" "Initech"; do
  DOCS=$(max search gdrive --type=file --filter "name~=*${company}*" --fields name,id -o ndjson | max stage)
  # → max:d4e5f6

  # Step 4: Ask subagent to summarize
  PROMPT="
  Company: ${company}
  Their docs: max:${DOCS}

  Read key documents and summarize what we know about them.
  Identify their pain points and needs.
  "
  # Subagent retrieves docs, reads some via 'max get gdrive <id> --content'
  # Subagent RETURNS (directly, it's a summary):
  #   "Acme Corp is a manufacturing company struggling with supply chain
  #    visibility. Recent meeting notes mention frustration with..."

  SUMMARIES[$company]=$SUBAGENT_RESPONSE
done

# Step 5: Generate blog proposals (using summaries directly — they're small)
for company in "Acme Corp" "Globex" "Initech"; do
  PROMPT="
  Company: ${company}
  What we know: ${SUMMARIES[$company]}

  Propose a targeted blog post addressing their needs.
  "
  # Subagent RETURNS proposal directly
done

# Step 6: Compile and present to user
```

### Data Flow Visualization

```
                                         ┌─────────────────┐
                                         │   Subagent A    │
                                   ┌────►│ "find top 10"   │────┐
                                   │     └─────────────────┘    │
                                   │                            │ returns:
┌──────────────┐    max:c1a2b3     │                            │ "Acme (5432)
│  All HubSpot │───────────────────┤                            │  Globex (3211)
│   Contacts   │  (token, tiny)    │                            │  ..."
│   (100k)     │                   │                            ▼
└──────────────┘                   │     ┌─────────────────┐
                                   │     │  Orchestrating  │
                                   │     │     Agent       │
┌──────────────┐    max:d4e5f6     │     │                 │
│  Acme Docs   │───────────────────┼────►│  (sees tokens   │
│   (47 files) │  (token, tiny)    │     │   + insights,   │
└──────────────┘                   │     │   not raw data) │
                                   │     │                 │
┌──────────────┐    max:d7e8f9     │     └────────┬────────┘
│ Globex Docs  │───────────────────┤              │
│   (23 files) │  (token, tiny)    │              │
└──────────────┘                   │              ▼
                                   │     ┌─────────────────┐
                                   │     │   Subagent B    │
                                   └────►│ "summarize Acme"│────► returns:
                                         └─────────────────┘      "Acme struggles
                                               ▲                   with supply
                                               │                   chain..."
                                          max:d4e5f6
                                         (retrieves docs)
```

## Design Principles

### 1. Language Agnostic

Staging is just pipes and CLI. Works from bash, node, python, anything:

```bash
# Bash
TOKEN=$(max search ... | max stage)

# Node
const { execSync } = require('child_process')
const token = execSync('max search ... | max stage').toString().trim()

# Python
import subprocess
token = subprocess.check_output('max search ... | max stage', shell=True).strip()
```

### 2. No DSL Required

We explicitly avoided a fluent query API like:
```javascript
// NOT this
max.search('hubspot').filter(...).groupBy(...).top(10)
```

Because:
- Ties implementation to Node
- Adds complexity
- Shell pipelines already work: `| jq | sort | uniq | head`

### 3. Orchestrating Agent Stays in Control

The staging primitive doesn't dictate control flow. The agent decides:
- When to stage
- What to pass to subagents
- How to parallelize (spawn multiple subagents)
- When to retrieve and aggregate

### 4. Visibility Without Complexity

`max stage list` and `max stage info` give observability without requiring a workflow engine. The agent can see what's staged, how big it is, when it expires.

### 5. Cleanup Is Max's Problem

- Auto-expiry handles abandoned staging
- Explicit `unstage` for eager cleanup
- Agent doesn't track file paths or manage lifecycle

## Comparison: With vs Without Staging

### Without Staging

```
Orchestrating agent context:
┌──────────────────────────────────────────────────────────────┐
│ System prompt                                         2,000  │
│ User request                                            100  │
│ HubSpot contacts (100k)                           2,000,000  │ ← BOOM
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

### With Staging

```
Orchestrating agent context:
┌──────────────────────────────────────────────────────────────┐
│ System prompt                                         2,000  │
│ User request                                            100  │
│ "Contacts staged at max:c1a2b3"                          20  │
│ Subagent response: "Top 10: Acme, Globex..."            200  │
│ "Acme docs at max:d4e5f6"                                20  │
│ Subagent response: "Acme summary..."                    500  │
│ ...                                                          │
│ Total: ~5,000 tokens                                         │ ← Manageable
└──────────────────────────────────────────────────────────────┘
```

## Future Extension: Operations

The staging pattern extends naturally to write operations.

### The Parallel

| Reads | Writes |
|-------|--------|
| `max stage` (data handle) | `max intent` (operation handle) |
| `max retrieve` (get data) | `max execute` (run operations) |
| `max stage list` | `max intent list` |
| `max stage info` | `max preview` (dry run) |

### Example: Bulk File Operations

```bash
# Stage the intent (what we want to do)
max search gdrive --filter "..." -o ndjson \
  | max intent copy --dest '${company}/${name}'
# → max:intent:a1b2c3

# Preview (dry run)
max preview max:intent:a1b2c3
# Would copy 500 files:
#   file1.doc → Acme Corp/file1.doc
#   file2.doc → Acme Corp/file2.doc
#   ...

# Execute with progress
max execute max:intent:a1b2c3
# Executing 500 operations...
# ████████████░░░░░░░░  234/500  (2 failed)
# Complete. Results: max:result:x7y8z9

# Inspect results
max retrieve max:result:x7y8z9
# {"succeeded": 498, "failed": 2, "failures": [...]}
```

### Why This Matters for Writes

Writes have different concerns than reads:
- **Progress** — long-running, want visibility
- **Partial failure** — some ops succeed, some fail
- **Audit** — what actually happened?
- **Idempotency** — can we safely retry?

The intent/execute split addresses these:
- Intent can be previewed before execution
- Execute tracks progress
- Results are inspectable after
- Same mental model as staging, just for actions

## Open Questions

1. **Token collision** — 8 chars is probably fine, but do we need longer?

2. **Expiry UX** — How does agent know when staging expires? Should we warn?

3. **Cross-session staging** — Can tokens survive agent restarts? Should they?

4. **Streaming retrieval** — `max retrieve` streams. Do we need random access?

5. **Staging metadata** — Should `max stage` accept metadata (source info, labels)?

## Summary

**Staging is the minimal primitive that solves the agent orchestration problem.**

- Tokens replace inline data in prompts
- Subagents retrieve what they need
- Orchestrating agent sees insights, not raw data
- No workflow engine, no DSL, just pipes and tokens
- Extends naturally to write operations later

The complexity budget is spent on the agent's intelligence, not on ceremony around data movement.
