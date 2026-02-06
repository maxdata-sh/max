# Plan: Execution Layer

## Context

We have the data definition layer (EntityDef, Ref, EntityInput/Result), the data fetching layer (Loader, Resolver, Context), and the storage layer (Engine, SqliteEngine). The missing piece is the **execution layer** - the thing that takes a declarative sync plan, orchestrates loaders, and stores results.

## Architecture

```
SyncPlan → SyncExecutor → Resolver → Loader → Engine.store()
                ↕                        ↕
           TaskStore              FlowController
           SyncMeta               (rate limiting)
```

### Package boundaries

| Package | Contains | Depends on |
|---------|----------|------------|
| `@max/core` | SyncPlan DSL, Seeder, FlowController interface, SyncMeta interface | (nothing new) |
| `@max/execution` | Task types, TaskStore interface, SyncExecutor, PlanExpander | `@max/core` |
| `@max/execution-local` | InMemoryTaskStore | `@max/execution` |

SyncPlan, Seeder, FlowController, and SyncMeta live in `@max/core` because connectors and storage packages need them. Connector packages shouldn't depend on `@max/execution`.

## New Abstractions

### 1. SyncPlan + Step (in @max/core)

Declarative, non-async description of sync steps. Data only.

```typescript
const plan = SyncPlan.create([
  Step.forRoot(rootRef).loadCollection("users"),
  Step.forAll(AcmeUser).loadFields("name", "email"),
  Step.concurrent([
    Step.forAll(AcmeTeam).loadCollection("members"),
    Step.forAll(AcmeProject).loadFields("name", "status"),
  ]),
]);
```

**Important**: `ForAll(AcmeUser)` targets all AcmeUser entities **in Max**, not upstream. This is how breadth-first scanning works:
1. `loadCollection("users")` fetches refs from upstream API → stores as stubs in Max
2. `ForAll(AcmeUser).loadFields(...)` iterates Max's store (paginated) → loads fields

**Collection loaders return EntityInputs, not Refs**: When the GDrive files list API returns file metadata, the CollectionLoader returns `Page<EntityInput<TTarget>>` with fields populated. This is a **change** to the existing CollectionLoader interface in `packages/core/src/loader.ts` (currently returns `Page<Ref<TTarget>>`). An EntityInput with all fields populated means those entities are effectively fully synced. By the time ForAll fires, the resolver step checks per-field staleness and skips fields that are already current.

**Step targets:**
- `Step.forAll(EntityDef)` - all entities of type in Max's store (paginated internally)
- `Step.forRoot(ref)` - a specific root entity
- `Step.forOne(ref)` - a specific entity

**Step operations:**
- `.loadFields("a", "b")` - load fields via resolvers (type-safe)
- `.loadCollection("field")` - load a collection field from upstream

**Composition:**
- Steps are sequential by default
- `Step.concurrent([...])` for parallel execution

### 2. Seeder (in @max/core)

Cold-start bootstrapper. Creates root entities, returns a SyncPlan.

```typescript
const AcmeSeeder = Seeder.create({
  context: AcmeAppContext,

  async seed(ctx, engine) {
    const rootRef = AcmeRoot.ref("root");
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      Step.forRoot(rootRef).loadCollection("users"),
      Step.forAll(AcmeUser).loadFields("name", "email"),
    ]);
  },
});
```

No resolver reference needed - the executor holds resolvers, not the seeder.

### 3. SyncMeta (in @max/core)

Interface for tracking sync metadata per entity. Separate from entity storage.

```typescript
interface SyncMeta {
  /** Record that fields were synced for an entity */
  recordFieldSync(ref: RefAny, fields: string[], timestamp: Date): Promise<void>;

  /** When was this field last synced for this entity? */
  getFieldSyncTime(ref: RefAny, field: string): Promise<Date | null>;

  /** Which fields are stale (or never synced) for this entity? */
  staleFields(ref: RefAny, fields: string[], maxAge: Duration): Promise<string[]>;

  /** Mark specific fields as needing re-sync */
  invalidateFields(ref: RefAny, fields?: string[]): Promise<void>;

  /** Is this entity fully synced (all specified fields non-stale)? */
  isFullySynced(ref: RefAny, fields: string[], maxAge: Duration): Promise<boolean>;
}
```

Staleness is **per-field**, not per-loader. An entity is "synced" when all its fields are populated and non-stale. A collection loader that populates all fields effectively completes the sync for those entities.

Storage: **companion table** `sync_meta(ref_key, field_name, synced_at)` in the same DB as entity data. Clean separation, JOINable for efficient filtered queries via SyncQueryEngine.

Default sync behaviour: skip fields that aren't stale. Overridable via sync configuration.

### 4. FlowController (in @max/core)

Interface for rate-limiting operations. General-purpose abstraction.

```typescript
interface FlowController {
  /** Request permission to perform an operation. Returns when allowed. */
  acquire(operation: OperationKind, count?: number): Promise<FlowToken>;

  /** Release a token (for operations that hold a slot) */
  release(token: FlowToken): void;
}

type OperationKind = Id<"operation-kind">;  // e.g., "acme:api-call"
```

The executor checks the FlowController before running loaders. If rate-limited, the task is requeued with a delay (enters `new` state with a "not before" timestamp).

Interface defined now. Implementation is future work - v1 executor can use a no-op FlowController.

### 5. Task + TaskState (in @max/execution)

```typescript
type TaskId = Id<"task-id">;

type TaskState =
  | "new"                // Created but not yet claimable (e.g., scheduled, rate-limited)
  | "pending"            // Ready to be claimed
  | "running"            // Claimed by a worker
  | "awaiting_children"  // Waiting for child tasks to complete
  | "completed"          // Done
  | "failed"             // Failed (with error)
  | "paused"             // Manually paused
  | "cancelled";         // Cancelled

type TaskKind =
  | "load-fields"
  | "load-collection"
  | "sync-step";

interface Task {
  id: TaskId;
  syncId: SyncId;          // Which sync this belongs to
  kind: TaskKind;
  state: TaskState;
  payload: TaskPayload;    // Discriminated by kind
  parentId?: TaskId;
  notBefore?: Date;        // For "new" state - when it becomes claimable
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}
```

Task payloads carry serialisable references (names/IDs, not runtime objects):

```typescript
type TaskPayload =
  | { kind: "load-fields"; entityType: EntityType; refKeys: RefKey[]; loaderName: LoaderName; fields: string[] }
  | { kind: "load-collection"; entityType: EntityType; refKey: RefKey; field: string; cursor?: string }
  | { kind: "sync-step"; step: SerialisedStep };
```

### 6. Serialisation Strategy

Tasks must be persistable. This means payloads reference entities and loaders by **name**, not by runtime object.

**Registry pattern:** The executor maintains registries that resolve names → runtime objects:
- `EntityType ("AcmeUser")` → `EntityDef` (already exists via `entityDef.name`)
- `LoaderName ("acme:user:basic")` → `Loader` instance
- `RefKey ("local:AcmeUser:u1")` → `Ref` (already exists via RefKey.parse)

The registries are built from the resolvers passed to the executor at startup. No new serialisation framework needed - we leverage existing branded types (EntityType, LoaderName, RefKey).

### 7. TaskStore (in @max/execution)

```typescript
interface TaskStore {
  enqueue(task: Omit<Task, "id" | "createdAt">): Promise<TaskId>;
  enqueueAll(tasks: Omit<Task, "id" | "createdAt">[]): Promise<TaskId[]>;

  /** Claim the next pending task (respects notBefore) */
  claim(): Promise<Task | null>;

  complete(id: TaskId): Promise<void>;
  fail(id: TaskId, error: string): Promise<void>;
  pause(id: TaskId): Promise<void>;
  cancel(id: TaskId): Promise<void>;

  /** Transition "new" tasks to "pending" when notBefore has passed */
  promoteReady(): Promise<number>;

  /** Paginated children */
  getChildren(parentId: TaskId, page?: PageRequest): Promise<Page<Task>>;
  allChildrenComplete(parentId: TaskId): Promise<boolean>;

  /** Sync-level queries */
  getTasksForSync(syncId: SyncId, state?: TaskState): Promise<Page<Task>>;
}
```

### 8. SyncHandle + SyncRegistry (in @max/execution)

Syncs can take days. `execute()` returns a handle, not a resolved promise.

```typescript
type SyncId = Id<"sync-id">;

interface SyncHandle {
  readonly id: SyncId;
  readonly plan: SyncPlan;
  readonly startedAt: Date;

  status(): Promise<SyncStatus>;
  pause(): Promise<void>;
  cancel(): Promise<void>;
  /** Await completion (or failure) */
  completion(): Promise<SyncResult>;
}

type SyncStatus = "running" | "paused" | "completed" | "failed" | "cancelled";

interface SyncResult {
  status: SyncStatus;
  tasksCompleted: number;
  tasksFailed: number;
  duration: number;
}

/** List and inspect active syncs */
interface SyncRegistry {
  list(): Promise<SyncHandle[]>;
  get(id: SyncId): Promise<SyncHandle | null>;
  /** Check if an equivalent plan is already running */
  findDuplicate(plan: SyncPlan): Promise<SyncHandle | null>;
}
```

### 9. SyncExecutor (in @max/execution)

The orchestrator.

```typescript
interface SyncExecutorConfig {
  engine: Engine;
  syncMeta: SyncMeta;
  resolvers: ResolverAny[];
  taskStore: TaskStore;
  flowController?: FlowController;
  contextProvider: () => Promise<Context>;
  concurrency?: number;  // Default: 1
}

class SyncExecutor {
  constructor(config: SyncExecutorConfig);

  /** Execute a sync plan, returns handle immediately */
  execute(plan: SyncPlan, options?: { syncId?: SyncId }): SyncHandle;

  /** Cold start from seeder */
  seed(seeder: SeederAny): Promise<SyncHandle>;

  /** Access active syncs */
  readonly syncs: SyncRegistry;
}
```

### 10. SyncQueryEngine (in @max/execution)

Composed query engine used internally by the sync layer. Wraps Engine + SyncMeta to provide stale-aware queries. Application code uses plain Engine; the sync layer uses this.

```typescript
interface SyncQueryEngine {
  /** Get refs that need syncing for a loader (stale or never loaded) */
  staleRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    maxAge: Duration,
    page?: PageRequest
  ): Promise<Page<Ref<E>>>;

  /** Get refs that have never been loaded by a loader */
  unloadedRefs<E extends EntityDefAny>(
    entity: E,
    loaderName: LoaderName,
    page?: PageRequest
  ): Promise<Page<Ref<E>>>;
}
```

This keeps sync concerns out of the Engine interface. The `@max/execution-local` implementation can use SQLite JOINs for efficiency (entity table + sync_meta table in same DB).

**Executor logic for ForAll(AcmeUser).loadFields("name", "email"):**
1. Consult resolver: which loaders provide "name" and "email"?
2. For each loader:
   a. Use SyncQueryEngine to page over stale/unloaded refs (filtering happens at DB level)
   b. For each page of stale refs:
      - For batched loaders: call `loader.load(refs, ctx, deps)`
      - For single loaders: call per-ref
      - Store each EntityInput via `engine.store(input)`
      - Record loader runs in SyncMeta

**Two kinds of pagination at play:**
- **External** (API): CollectionLoader handles upstream API pagination (cursor-based, loader manages this)
- **Internal** (Max): ForAll iterates Max's entity store in pages via SyncQueryEngine (filtering stale entities at the DB level, not in memory)

### 11. InMemoryTaskStore (in @max/execution-local)

Simple array + counter. Enough to validate the architecture.

## File Structure

```
packages/core/src/
├── sync-plan.ts          # NEW: SyncPlan, Step, StepTarget
├── seeder.ts             # NEW: Seeder interface
├── sync-meta.ts          # NEW: SyncMeta interface
├── flow-controller.ts    # NEW: FlowController interface (+ no-op impl)
└── index.ts              # UPDATE: export new types

packages/execution/src/
├── task.ts               # NEW: Task, TaskId, TaskState, TaskPayload
├── task-store.ts         # NEW: TaskStore interface
├── sync-handle.ts        # NEW: SyncHandle, SyncRegistry, SyncResult
├── sync-query-engine.ts  # NEW: SyncQueryEngine interface (Engine + SyncMeta composition)
├── plan-expander.ts      # NEW: Expand SyncPlan steps → Tasks
├── sync-executor.ts      # NEW: SyncExecutor
├── registry.ts           # NEW: EntityDef/Loader registries (name → runtime)
└── index.ts

packages/execution-local/src/
├── in-memory-task-store.ts
├── local-sync-query-engine.ts  # NEW: SyncQueryEngine impl (can use SQLite JOINs)
└── index.ts

connectors/connector-acme/src/
├── seeder.ts             # NEW: AcmeSeeder
└── index.ts              # UPDATE
```

## Implementation Order

**Phase A: Core interfaces** (in @max/core)
1. Update `loader.ts` - CollectionLoader returns `Page<EntityInput<TTarget>>` (not `Page<Ref<TTarget>>`)
2. `sync-plan.ts` - SyncPlan, Step DSL
3. `seeder.ts` - Seeder interface
4. `sync-meta.ts` - SyncMeta interface
5. `flow-controller.ts` - FlowController interface + NoOpFlowController

**Phase B: Execution interfaces + types** (in @max/execution)
5. `task.ts` - Task types and payloads
6. `task-store.ts` - TaskStore interface
7. `sync-query-engine.ts` - SyncQueryEngine interface
8. `sync-handle.ts` - SyncHandle, SyncRegistry
9. `registry.ts` - Name → runtime registries

**Phase C: Implementation** (across packages)
10. `in-memory-task-store.ts` - InMemoryTaskStore
11. `local-sync-query-engine.ts` - LocalSyncQueryEngine
12. `plan-expander.ts` - Expand plan steps to tasks
13. `sync-executor.ts` - SyncExecutor

**Phase D: Validation**
12. `AcmeSeeder` in connector-acme
13. E2E test: seed → sync → verify stored data

## Verification

1. `bunx tsc --noEmit` passes across all packages
2. SyncPlan type-checks field names against entity
3. E2E: seed → sync → query → data is in SQLite
4. Staleness: second sync skips already-loaded entities
5. Collection pagination: mock API returns multiple pages, all processed
6. SyncHandle: can check status while sync is running
