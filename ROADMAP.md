# Roadmap

A running list of what needs doing, what could be better, and what we've deferred.

Items are grouped by area. Within each group, items near the top are more pressing.

---

## Housekeeping
- SyncMeta should not be in core, and should be a Service. Possibly `execution`.
- FlowController should not be in core. Possibly `execution`.
- Credentials need to be written / accessed through a CredentialStore


---

## General / utility

### Serialisation
Codec-based strategy for serialising/deserialising types across boundaries (Temporal, storage, IPC). Approach decided, implementation deferred to first real boundary. See [docs/developer/serialisation.md](docs/developer/serialisation.md).

---

## Sync / Execution Layer

### Needed

- **Loader dependency resolution (`dependsOn`)**
  Loaders can declare `dependsOn: [otherLoader]` in the type system, but the execution layer ignores it. `DefaultTaskRunner.assertNoDeps()` throws if a loader has dependencies. This blocks any loader that needs shared data (e.g. a config loader that fetches API limits, consumed by other loaders). Requires: resolve deps before calling a loader, store results in `LoaderResults`, pass to `loader.load()`.

- **Raw loader support**
  `Loader.raw()` exists in the type system but the execution layer can't run it. No task payload type, no dispatch path in `DefaultTaskRunner`. Raw loaders are the intended mechanism for standalone data fetches (global config, rate limits, metadata) and are the primary use case for `dependsOn`. These two items are coupled.

- **Error recovery / resume**
  When a sync has failures, stranded tasks remain in honest states (`new`, `awaiting_children`). A resume operation should retry failed tasks, which would naturally unblock the rest. The state model supports this — the mechanism to trigger it doesn't exist yet.

### Opportunities

- **SQLite storage uses single column, switch to multi**
  N rows rather than K*N rows

- **Schedule loader calls as tasks**
  Currently, loaders run inline within a `sync-step` task. If individual loader calls were scheduled as their own tasks, two things become possible:
  1. **Deduplication** — if many tasks want the same data (e.g. multiple collection loads that all discover user "u1"), the system could coalesce into a single load.
  2. **Cross-step batching** — a batched loader (e.g. `BasicUserLoader.load(refs[])`) could collect refs from multiple sources and make one API call instead of many.

  This is a significant architectural change but could dramatically reduce API calls for connectors with high entity overlap.

- **Concurrent task claiming**
  The drain loop is single-threaded: claim one task, execute it, repeat. For I/O-bound loaders (most of them), running multiple tasks concurrently would improve throughput. The `FlowController` already exists for rate limiting — concurrency would pair with it.

---

## Field Freshness & Incremental Sync

The sync layer currently re-loads everything on every run. Three features, built on shared primitives, fix this:

1. **TTL skip** — Fields with a declared TTL are skipped if recently synced
2. **Invalidation** — Mark specific fields as stale on demand, picked up by next sync
3. **Heal sync** — Scan for gaps (missing, expired, invalidated) and generate a minimal plan

Partial plan with architecture, layer responsibilities, test shapes, and implementation order: [docs/ideas/field-freshness-and-incremental-sync.md](docs/ideas/field-freshness-and-incremental-sync.md)

---

## Storage / Engine

### Needed

- *(nothing urgent)*

### Opportunities

- *(nothing yet)*

---

## Type System / Core

### Needed

- *(nothing urgent)*

### Opportunities

- **Loader dependency type safety**
  When `dependsOn` is implemented, ensure the `LoaderResults` type is narrowed based on declared dependencies — a loader that depends on `ConfigLoader` should get typed access to its result, not `unknown`.

---

## CLI

### Needed

- *(nothing urgent)*

### Opportunities

- *(nothing yet)*

---

## Notes

This is a living document. Add items as they come up. Remove them when they're done. If an item grows complex enough to need its own exploration, move it to `docs/ideas/`.
