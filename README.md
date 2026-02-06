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
max init

# Connect Google Drive (requires OAuth setup - see below)
max connect gdrive

# Sync all data
max sync gdrive

# Search for documents
max search gdrive --type=document

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
