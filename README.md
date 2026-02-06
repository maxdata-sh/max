# Max - token efficient data for agents

**Fat pipe beats thin straw.**

Max is a CLI tool that syncs data from SaaS tools into a local data store, enabling powerful queries with permission controls.

## Developing Max

**Building a connector?** See the [Developer Guide](./docs/developer/README.md):
- [Creating an Integration](./docs/developer/creating-an-integration.md) - Step-by-step guide
- [Core Concepts](./docs/developer/core-concepts.md) - Ref, Scope, EntityDef, etc.
- [Utilities](./docs/developer/utilities.md) - Batch, Page, Brand, and patterns

## Quick Start (Using max)

```bash
# Building from source -> ./dist/max
pnpm install && pnpm run build

# Initialize a new project
cd my-project
max init              # Initialises current folder with .max/

# Getting connected              
max connect gdrive    # Connect to <app> - gdrive/linear etc
max sync gdrive       # Pull <app> data into max

# Suggested: Install completions
max completions zsh > _max
source _max # or add to your shell setup

# Inform your agent
"Hey claude, set yourself up a `max` skill, that runs !`max llm-bootstrap`"

# Explore manually
max search gdrive -o ndjson \
    --limit 500 \
    --filter='ownerEmail=rob@gmail.com AND title~="Rob"'
```

## Limitations (v0.1)

- No incremental sync (full sync each time)
- No free-text content search
- Not production ready!

## Plans

- Mirroring (subset of data for specific agents)
- Identity-aware permissions
- Additional connectors
- Free-text and semantic search
- Audit/diff commands
- much more...
