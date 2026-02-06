# Execution Harness: Evolution of Ideas

A record of how we arrived at the staging primitive, and ideas we explored along the way.

## Starting Point: The FD 3 Problem

Max originally used file descriptor 3 for pagination metadata:

```bash
max search hubspot --type=contact -o ndjson 3>meta.json
```

This worked for humans but **failed for LLM agents** — most agent frameworks can't issue commands with `3>` redirection.

**Solution:** State file pagination with `--state=max:token` flag. This worked, but surfaced a bigger question: how do agents efficiently orchestrate complex, multi-step data operations?

## Idea 1: Full Execution Harness (Temporal-style)

Inspired by Temporal workflows, we explored a model where agents write programs that Max executes as a runtime:

```javascript
// Agent writes this program
const contacts = await max.search('hubspot', { type: 'contact', all: true })
const topNames = contacts.countBy('firstName').top(10)

for (const name of topNames) {
  const files = await max.search('gdrive', { filter: `name~=*${name}*` })
  max.reply(`files-for-${name}`, files)
}
```

**The appeal:**
- Parallel execution handled by runtime
- Progress observability built-in
- Agent receives results via named "answer slots"

**The concerns:**
- Ties implementation to Node
- Complex bidirectional protocol (yield/resume)
- Adds a workflow engine to maintain

## Idea 2: Bidirectional Harness with Agent Intervention

We explored a model where the harness could pause and yield to the agent:

```javascript
// Harness pauses here, sends data to agent, waits for response
const selectedNames = await max.yield('select-names', {
  top10: await contacts.countBy('firstName').top(10)
})

// Agent responds with: ["John", "Sarah", "Mike"]
// Harness continues with agent's selection
```

**The appeal:**
- Agent can inject intelligence at strategic points
- Data stays in harness, only decisions cross the boundary

**The concerns:**
- Complex state machine
- Agent must understand yield/resume protocol
- Still Node-specific

## Idea 3: Declarative Operation Registry

Simplified to: harness defines named operations, agent calls them externally.

```javascript
// Harness is just a registry
max.define('all-contacts', () =>
  max.exec('search hubspot --type=contact --all'))

max.define('files-for', (name) =>
  max.exec(`search gdrive --filter "name~=*${name}*"`))
```

```bash
# Agent calls operations by name
./harness.sh all-contacts | jq ... | sort | uniq
./harness.sh files-for "John" | jq ...
```

**The appeal:**
- Language agnostic (bash works!)
- Agent controls orchestration
- No yield/resume complexity

**The concerns:**
- Loses visibility into progress
- Harness is "dumb" — no introspection

## Idea 4: Dataflow Graph with Observability

Tried to add Temporal-style observability to the registry model:

```javascript
h.source('contacts', () => max.search(...))
h.transform('top-names', 'contacts', stream => stream.top(10))
h.fanout('files', 'top-names', name => max.search(...))
h.external('summaries', 'files', 'Agent summarizes')
h.sink('report', 'summaries')
```

```
max harness status prog.mjs

contacts    ████████████████████████  98,543 records    complete
top-names   ████████████████████████  10 names          complete
files       ████████████████░░░░░░░░  7/10 branches     running
summaries   ██████░░░░░░░░░░░░░░░░░░  3/10 complete     awaiting input
```

**The appeal:**
- Full visibility into pipeline progress
- Clear intervention points
- Structure is introspectable

**The concerns:**
- Adds significant complexity
- Is this solving the right problem?

## The Breakthrough: What's the Actual Pain Point?

Stepping back, we asked: what does the agent actually struggle with?

**Not** orchestration — agents are good at reasoning about steps.
**Not** parallelism — agents can spawn subagents.

**The real pain:** Token cost of passing data between agents.

```
BAD:  "Subagent, here are 100 files: [2000 tokens of data]"
GOOD: "Subagent, your files are at max:abc123"
```

## Idea 5: Staging (The Winner)

Strip away the workflow engine. The primitive is just: **give data a handle**.

```bash
# Stage data, get token
TOKEN=$(max search hubspot --all -o ndjson | max stage)
# → max:a1b2c3d4

# Pass token to subagent (tiny!)
"Your contacts are at max:a1b2c3d4"

# Subagent retrieves
max retrieve max:a1b2c3d4 | jq ...
```

**Why this wins:**
- Minimal complexity
- Language agnostic
- Solves the actual problem (token efficiency)
- Visibility via `max stage list/info`
- Cleanup handled by max (auto-expiry)

**What we gave up:**
- Automatic progress tracking (agent tracks manually)
- Dependency graph introspection (agent reasons about it)
- Automatic parallelism (agent spawns subagents)

These tradeoffs are fine because agents are good at orchestration. They just need efficient data handoff.

## The Insight: Stage Data, Return Insights

A subagent receiving `max:a1b2c3d4` processes the data and returns an **insight** directly:

```
Orchestrator: "Contacts at max:a1b2c3d4. Find top 10 companies."
Subagent: (retrieves, processes) → "Acme (5432), Globex (3211), ..."
```

The insight is small, fits in the response. No need to stage the answer.

**Stage when:** Raw data, large intermediate results, data flowing between subagents.
**Return directly when:** Summaries, decisions, short lists, anything the orchestrator needs to see.

## Future: Operations Follow the Same Pattern

For writes (copy, rename, update), the pattern extends:

| Reads | Writes |
|-------|--------|
| `max stage` | `max intent` |
| `max retrieve` | `max execute` |
| `max stage info` | `max preview` |

Same mental model, different verb.

## Key Learnings

1. **Start with the pain point, not the solution.** We almost built a workflow engine before realizing the problem was simpler.

2. **Agents are smart.** Don't build infrastructure for things agents can reason about (orchestration, parallelism, error handling).

3. **Tokens beat inline data.** A 12-character token replacing 2000 tokens of data is the win.

4. **Language agnosticism matters.** Tying to Node would limit flexibility. Pipes and CLI work everywhere.

5. **Observability can be simple.** `max stage list` is enough. Don't need Temporal-level dashboards.

## What We Didn't Build (Yet)

These remain future options if staging proves insufficient:

- Progress streaming during execution
- Dependency graph visualization
- Automatic fan-out parallelism
- Checkpoint/resume for long operations

But staging is the foundation. Start simple, add complexity only when needed.
