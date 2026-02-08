# Field Freshness & Incremental Sync

**Status:** Partial plan — architecture decided, implementation not started.

## Problem

The sync layer re-loads everything on every run. A second sync of 10,000 users makes the same 10,000 API calls even if nothing changed. We need the system to know when data is fresh, when it's stale, and how to fill gaps without redoing everything.

## Three features, one foundation

Three capabilities build on the same underlying primitives:

1. **TTL skip** — Don't re-sync fields that are still fresh
2. **Invalidation** — Mark specific fields as stale on demand
3. **Heal sync** — Scan for gaps and fill them

```
┌─────────────────────────────────────────────┐
│              Heal Sync (plan generator)      │
├─────────────────────────────────────────────┤
│    TTL Skip          │    Invalidation       │
│  (freshness check)   │  (mark stale)         │
├─────────────────────────────────────────────┤
│            Freshness Primitives              │
│  Field TTL · Static flag · SyncMeta state    │
└─────────────────────────────────────────────┘
```

## Where the logic lives

| Layer | Responsibility |
|---|---|
| **Core** (`@max/core`) | Defines the vocabulary: field TTL, static flag, `SyncMeta` interface |
| **Execution** (`@max/execution`, `execution-local`) | Makes the decisions: TaskRunner checks freshness before calling loaders |
| **Storage** (`storage-sqlite`, in-memory) | Implements persistence: SyncMeta stores timestamps and invalidation marks |

The decision point is in the TaskRunner, between querying refs and calling loaders:

```
executeForAllLoadFields(entityDef, target, fields)
  → engine.query(entityDef).refs()         // which entities exist?
  → for each ref:
      → syncMeta.getFieldSync(ref, field)  // when was this last synced?    ← NEW
      → compare against declared TTL       // is it still fresh?            ← NEW
      → if stale: include in loader call
      → if fresh: skip
  → loader.load(staleRefs, ctx, deps)      // only fetch what's needed
  → engine.store(...)
  → syncMeta.recordFieldSync(...)
```

## Foundation: freshness primitives

### Field metadata (core)

Fields need two new optional properties:

```typescript
// On field definition or loader declaration
{
  ttl: Duration,       // e.g. "1h", "7d" — how long before eligible for re-sync
  static: boolean,     // true = never re-sync unless explicitly invalidated
}
```

Open question: does TTL live on the field definition (`EntityDef`) or on the loader? Leaning towards loader — the same field could have different freshness guarantees depending on how it's fetched. A loader that calls a real-time API might have a short TTL; one that reads a cache might have a longer one.   

### SyncMeta interface (core)

Currently has:
```typescript
recordFieldSync(ref: RefAny, fields: string[], syncedAt: Date): Promise<void>
```

Needs to add:
```typescript
// Query freshness
getFieldSync(ref: RefAny, field: string): Promise<{ syncedAt: Date; invalidated: boolean } | null>

// Bulk query — "which of these refs need this field re-synced?"
filterStale(refs: RefAny[], field: string, ttl: Duration): Promise<RefAny[]>

// Invalidation
invalidateFields(ref: RefAny, fields: string[]): Promise<void>

// For heal sync — find all gaps
findStaleFields(entityType: EntityType, fields: string[], ttl: Duration): Promise<RefAny[]>
findNeverSynced(entityType: EntityType, fields: string[]): Promise<RefAny[]>
```

`filterStale` is the workhorse — the TaskRunner calls it with a batch of refs and gets back only the ones that need work. This avoids N individual lookups.

### SyncMeta storage (storage layer)

The existing `_max_sync_meta` table likely needs an `invalidated_at` column (or a boolean flag). When a field is invalidated, this gets set. When it's re-synced, it gets cleared.

## Feature 1: TTL skip

**What changes:**
- Core: TTL declaration on loaders
- Execution: `DefaultTaskRunner.processLoadFieldsForRefs()` calls `syncMeta.filterStale()` before calling the loader, passing only stale refs
- Storage: `filterStale` implementation (SQL query comparing timestamps)

**Behaviour:**
- First sync: all fields are missing from SyncMeta → all refs are stale → full sync
- Second sync within TTL: all refs are fresh → no API calls → sync completes instantly
- Second sync after TTL expires: refs are stale again → API calls happen

**Test shape:**
```
1. Sync with mock API (assert: API called)
2. Sync again immediately (assert: API NOT called — fields within TTL)
3. Advance time past TTL (or set a very short TTL)
4. Sync again (assert: API called — fields expired)
```

## Feature 2: Invalidation

**What changes:**
- Core: `SyncMeta.invalidateFields(ref, fields)` interface method
- Storage: sets `invalidated_at` on matching sync_meta rows
- Execution: `filterStale` treats invalidated fields as stale regardless of TTL

**Behaviour:**
- Sync runs, everything is fresh
- External event (webhook, user action) triggers `syncMeta.invalidateFields(teamRef, ["name"])`
- Next sync: "name" on that team is stale (invalidated), other fields are still fresh
- After re-sync: invalidation mark is cleared

**Test shape:**
```
1. Sync with mock API (all fields populated)
2. Invalidate "name" on one team
3. Sync again
4. Assert: API called for "name" on that team only
5. Assert: API NOT called for other teams or other fields
```

**Future extension:** bulk invalidation with filters — "invalidate 'name' on all AcmeTeam entities" or "invalidate all fields on refs matching a condition." The primitive is per-ref-per-field; bulk operations are sugar on top.

## Feature 3: Heal sync

**Status:** Needs design. The goal is clear — bring stale/missing fields up to date — but the right mechanism is not.

**The problem with "generate a plan targeting gaps":**
A naive approach (query all stale refs, emit `forRefs(staleRefs).loadFields(...)`) doesn't scale. There could be millions of stale entities. You can't materialise that list upfront as a plan.

**Possible approaches — all have tradeoffs:**

1. **Materialise a work list, paginate over it**
   Query SyncMeta for all stale refs, store the result set somewhere (a temp table, a cursor), and have a worker paginate through it executing loads. This is outside the normal SyncPlan model — it's a different execution mode with its own loop. Simple to reason about, but a separate codepath.

2. **A "heal" step type**
   A new step variant (alongside `forAll`, `forRoot`, `forOne`) that has built-in freshness-aware iteration. Instead of querying *all* refs of a type, it queries *stale* refs. The TaskRunner knows how to execute it, paginating over SyncMeta rather than the entity store. Fits within the existing plan/executor model, but the step's semantics are different from the others.

3. **Reactive / continuous worker**
   Rather than a batch "heal" pass, invalidation immediately enqueues work. When `syncMeta.invalidateFields(ref, fields)` is called, a background worker picks it up and re-syncs. This is more of an event-driven model — closer to a queue consumer than a sync plan. Lowest latency, but the most architectural change.

These aren't mutually exclusive. Option 2 or 1 could handle bulk healing (new field added to a resolver, TTL expiry), while option 3 handles targeted invalidation (webhook says "user X changed").

**Not deciding yet.** TTL skip and invalidation (features 1 and 2) are useful independently and don't depend on heal sync's design. Build those first, then the right heal approach may become clearer from usage.

## Implementation order

1. **`filterStale` on SyncMeta** — the foundational query. Everything else builds on it.
2. **TTL declarations + TaskRunner freshness check** — feature 1 (skip fresh fields).
3. **`invalidateFields` on SyncMeta** — feature 2 (targeted invalidation). Small delta on top of the freshness check.
4. **Heal sync** — feature 3. Needs design work first. Build features 1 and 2, learn from usage, then decide on approach.

## What this doesn't cover

- **Collection freshness** — the above focuses on scalar/ref fields. Collection membership ("which users are in this team?") has different freshness semantics. A collection can grow or shrink; you can't know it's stale without asking the API. Likely needs a separate mechanism (e.g. collection-level TTL that triggers a full re-page).
- **Webhook-driven invalidation** — the invalidation primitive is synchronous and local. Wiring it to external webhooks is a separate concern.
- **Concurrent sync safety** — if two syncs run simultaneously, the freshness checks need to handle races. Not a concern for the single-threaded drain loop, but matters if we add concurrency later.
