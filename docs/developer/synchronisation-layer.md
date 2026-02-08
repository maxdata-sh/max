# Synchronisation Layer

How Max syncs data from external sources into its local store.

---

## Overview

The sync layer has three parts:

1. **Resolvers & Loaders** define *how* to fetch data for each entity type
2. **Seeders & SyncPlans** define *what* to sync and in what order
3. **The Executor** turns a plan into a task graph and drains it

```mermaid
flowchart LR
    subgraph Define
        R[Resolvers] --> L[Loaders]
    end
    subgraph Plan
        S[Seeder] --> SP[SyncPlan]
    end
    subgraph Execute
        SP --> EX[Executor]
        EX --> TG[Task Graph]
        TG --> DR[Drain Loop]
        DR --> |calls| L
        DR --> |stores| E[Engine]
    end
```

---

## Loaders

A **Loader** fetches data from an external API and returns `EntityInput` values. There are three variants:

| Variant | Signature | Use case |
|---|---|---|
| `entity` | `(ref) => EntityInput` | Fetch one entity at a time |
| `entityBatched` | `(refs[]) => Batch<EntityInput>` | Fetch many entities in one API call |
| `collection` | `(parentRef, page) => Page<EntityInput>` | Paginated child entities |

```mermaid
flowchart TD
    subgraph "Loader Variants"
        EL["entity\n(ref) => EntityInput"]
        EB["entityBatched\n(refs[]) => Batch"]
        CL["collection\n(ref, page) => Page"]
    end

    API[External API]
    EL --> API
    EB --> API
    CL --> API
```

### Entity Loader

Fetches fields for a single entity.

```typescript
const TeamBasicLoader = Loader.entity({
  name: "acme:team:basic" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeTeam,

  async load(ref, ctx, deps) {
    const team = await ctx.api.teams.get(ref.id);
    return EntityInput.create(ref, {
      name: team.name,
      description: team.description,
      owner: AcmeUser.ref(team.ownerId),
    });
  },
});
```

### Batched Entity Loader

Fetches fields for many entities in a single API call. Preferred when the API supports batch retrieval.

```typescript
const BasicUserLoader = Loader.entityBatched({
  name: "acme:user:basic" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeUser,

  async load(refs, ctx, deps) {
    const users = await ctx.api.users.getBatch(refs.map(r => r.id));
    return Batch.buildFrom(
      users.map(u => EntityInput.create(AcmeUser.ref(u.id), {
        name: u.name,
        email: u.email,
      }))
    ).withKey(input => input.ref);
  },
});
```

### Collection Loader

Fetches a paginated list of child entities belonging to a parent.

```typescript
const TeamMembersLoader = Loader.collection({
  name: "acme:team:members" as LoaderName,
  context: AcmeAppContext,
  entity: AcmeTeam,
  target: AcmeUser,

  async load(ref, page, ctx, deps) {
    const result = await ctx.api.teams.listMembers(ref.id, {
      cursor: page.cursor,
      limit: page.limit,
    });
    const items = result.members.map(m =>
      EntityInput.create(AcmeUser.ref(m.userId), {})
    );
    return Page.from(items, result.hasMore, result.nextCursor);
  },
});
```

---

## Resolvers

A **Resolver** maps an entity's fields to the loaders that populate them. Each field points to exactly one loader.

```mermaid
flowchart LR
    subgraph "AcmeTeam Resolver"
        N[name] --> TBL[TeamBasicLoader]
        D[description] --> TBL
        O[owner] --> TBL
        M[members] --> TML[TeamMembersLoader]
    end

    TBL --> |"entity"| API[External API]
    TML --> |"collection"| API
```

```typescript
const AcmeTeamResolver = Resolver.for(AcmeTeam, {
  name: TeamBasicLoader.field("name"),
  description: TeamBasicLoader.field("description"),
  owner: TeamBasicLoader.field("owner"),
  members: TeamMembersLoader.field(),
});
```

Multiple fields can share a loader. When the executor needs to load `name` and `description`, it sees both map to `TeamBasicLoader` and makes a single call.

---

## Seeder & SyncPlan

A **Seeder** bootstraps a sync from cold start. It stores an initial entity (the root) and returns a **SyncPlan** describing what to sync and in what order.

```typescript
const AcmeSeeder = Seeder.create({
  context: AcmeAppContext,

  async seed(ctx, engine) {
    // Store the root entry point
    const rootRef = AcmeRoot.ref("root");
    await engine.store(EntityInput.create(rootRef, {}));

    return SyncPlan.create([
      Step.forRoot(rootRef).loadCollection("teams"),
      Step.forAll(AcmeTeam).loadFields("name", "description", "owner"),
      Step.forAll(AcmeTeam).loadCollection("members"),
      Step.forAll(AcmeUser).loadFields("name", "email"),
    ]);
  },
});
```

### Steps

A SyncPlan is a sequence of steps. Each step has a **target** (which entities) and an **operation** (what to load).

**Targets:**

| Target | Meaning |
|---|---|
| `forRoot(ref)` | A single known root entity |
| `forOne(ref)` | A single known entity |
| `forAll(EntityDef)` | All entities of this type in the store |

**Operations:**

| Operation | Meaning |
|---|---|
| `loadFields("a", "b")` | Load the named fields via their resolvers |
| `loadCollection("field")` | Load a collection field (paginated) |

Steps run **sequentially** by default. Each step waits for the previous step (and all its children) to finish before starting. This matters because later steps often depend on entities discovered by earlier ones.

```mermaid
flowchart TD
    S1["1. forRoot(root).loadCollection('teams')\nDiscover all teams"]
    S2["2. forAll(AcmeTeam).loadFields(...)\nLoad team details"]
    S3["3. forAll(AcmeTeam).loadCollection('members')\nDiscover team members"]
    S4["4. forAll(AcmeUser).loadFields(...)\nLoad user details"]

    S1 --> S2 --> S3 --> S4

    S1 -.- T1["AcmeTeam entities\nappear in store"]
    S3 -.- T2["AcmeUser entities\nappear in store"]

    style T1 fill:none,stroke-dasharray:5 5
    style T2 fill:none,stroke-dasharray:5 5
```

### Concurrent Steps

Steps that don't depend on each other can run in parallel:

```typescript
SyncPlan.create([
  Step.forRoot(rootRef).loadCollection("teams"),
  Step.concurrent([
    Step.forAll(AcmeTeam).loadFields("name"),
    Step.forAll(AcmeProject).loadFields("status"),
  ]),
]);
```

---

## Execution

The **SyncExecutor** turns a SyncPlan into a task graph and processes it.

### From Plan to Task Graph

The **PlanExpander** converts each step into one or more tasks, wiring up dependencies:

```mermaid
flowchart TD
    subgraph "SyncPlan (declarative)"
        P1[Step 1: forRoot load teams]
        P2[Step 2: forAll teams loadFields]
        P3[Step 3: forAll teams loadCollection members]
        P4[Step 4: forAll users loadFields]
        P1 --> P2 --> P3 --> P4
    end

    subgraph "Task Graph (executable)"
        T1["sync-step\n(pending)"]
        T2["sync-step\n(new, blockedBy: T1)"]
        T3["sync-step\n(new, blockedBy: T2)"]
        T4["sync-step\n(new, blockedBy: T3)"]
        T1 -.->|unblocks| T2 -.->|unblocks| T3 -.->|unblocks| T4
    end

    P1 --> T1
    P2 --> T2
    P3 --> T3
    P4 --> T4
```

Tasks start in `new` (blocked) or `pending` (ready). When a blocking task completes, its dependents move from `new` to `pending`.

### Task States

```mermaid
stateDiagram-v2
    [*] --> new : created with blockedBy
    [*] --> pending : created without blockedBy
    new --> pending : blocker completes
    pending --> running : claimed by drain loop
    running --> completed : success
    running --> failed : error thrown
    running --> awaiting_children : spawned child tasks
    awaiting_children --> completed : all children completed
```

### Dynamic Children

Some tasks spawn child tasks at runtime. When a `forAll` step processes a collection, it creates one `load-collection` child per entity. The parent moves to `awaiting_children` and completes when all children finish.

```mermaid
flowchart TD
    T3["sync-step: forAll AcmeTeam loadCollection 'members'\n(awaiting_children)"]
    C1["load-collection: team-1\n(pending)"]
    C2["load-collection: team-2\n(pending)"]
    C3["load-collection: team-3\n(pending)"]

    T3 --> C1
    T3 --> C2
    T3 --> C3

    C1 --> |stores| U1[AcmeUser entities]
    C2 --> |stores| U2[AcmeUser entities]
    C3 --> |stores| U3[AcmeUser entities]

    style U1 fill:none,stroke-dasharray:5 5
    style U2 fill:none,stroke-dasharray:5 5
    style U3 fill:none,stroke-dasharray:5 5
```

Collection loaders also paginate. If a page has more results, the task spawns a continuation child with the next cursor:

```mermaid
flowchart TD
    LC1["load-collection: team-1\ncursor: undefined"]
    LC2["load-collection: team-1\ncursor: '100'"]
    LC3["load-collection: team-1\ncursor: '200'\n(last page)"]

    LC1 -->|hasMore| LC2 -->|hasMore| LC3
```

### The Drain Loop

The executor runs a single loop that claims and processes tasks one at a time:

```mermaid
flowchart TD
    START([Start]) --> CLAIM[Claim next pending task]
    CLAIM -->|got task| EXEC[Execute task]
    CLAIM -->|none available| CHECK{Any pending\nor running\ntasks?}
    CHECK -->|yes| WAIT[Sleep 10ms] --> CLAIM
    CHECK -->|no| DONE([Sync complete])
    EXEC -->|spawned children| AC[Set task to\nawaiting_children]
    EXEC -->|no children| COMPLETE[Complete task]
    EXEC -->|threw| FAIL[Fail task]
    AC --> CLAIM
    COMPLETE --> UNBLOCK[Unblock dependents\n+ check parent] --> CLAIM
    FAIL --> CLAIM
```

When a task completes:
1. Tasks blocked by it (`blockedBy`) move from `new` to `pending`
2. If all siblings of a parent are complete, the parent completes too (recursively)

### Error Handling

When a task fails, the drain loop marks it as `failed` and moves on. The loop exits when no tasks are `pending` or `running` — tasks left in `new` (blocked by a failed task) or `awaiting_children` (with a failed child) remain in those states.

The `SyncResult` reports both `tasksCompleted` and `tasksFailed`, so the caller knows the sync wasn't clean.

```mermaid
flowchart TD
    T1["sync-step: load team fields\n(failed - API error)"]
    T2["sync-step: load members\n(new - still blocked)"]
    T3["sync-step: load users\n(new - still blocked)"]

    T1 -.->|would unblock| T2 -.->|would unblock| T3

    R["SyncResult\nstatus: completed\ntasksCompleted: 1\ntasksFailed: 1"]

    style T1 fill:#f66,color:#fff
    style T2 fill:#999,color:#fff
    style T3 fill:#999,color:#fff
```

The stranded tasks preserve honest state: they weren't cancelled or failed — they were never attempted. A future resume operation could retry the failed task, which would naturally unblock the rest.

### SyncHandle

`execute()` returns a `SyncHandle` immediately. The sync runs in the background.

```typescript
const handle = executor.execute(plan);

// Monitor
const status = await handle.status();  // "running" | "paused" | "completed" | ...

// Control
await handle.pause();
await handle.resume();
await handle.cancel();

// Wait for result
const result = await handle.completion();
// { status: "completed", tasksCompleted: 12, tasksFailed: 0, duration: 1540 }
```

---

## End-to-End Example

Putting it all together for the Acme connector:

```mermaid
sequenceDiagram
    participant Seeder
    participant Engine as Engine (SQLite)
    participant Executor
    participant TaskStore
    participant Loaders
    participant API as Acme API

    Seeder->>Engine: store(AcmeRoot "root")
    Seeder->>Executor: execute(SyncPlan)

    Note over Executor,TaskStore: Plan expansion
    Executor->>TaskStore: enqueueGraph([T1, T2, T3, T4])

    Note over Executor: Drain loop begins

    rect rgb(240, 248, 255)
        Note over Executor: Step 1: Discover teams
        Executor->>TaskStore: claim() => T1
        Executor->>Loaders: RootTeamsLoader.load(root)
        Loaders->>API: listTeams()
        API-->>Loaders: [{id: "team-1"}, {id: "team-2"}]
        Loaders->>Engine: store(AcmeTeam "team-1")
        Loaders->>Engine: store(AcmeTeam "team-2")
        Executor->>TaskStore: complete(T1), unblock(T2)
    end

    rect rgb(240, 255, 240)
        Note over Executor: Step 2: Load team fields
        Executor->>TaskStore: claim() => T2
        Executor->>Loaders: TeamBasicLoader.load(team-1)
        Loaders->>API: teams.get("team-1")
        Executor->>Loaders: TeamBasicLoader.load(team-2)
        Loaders->>API: teams.get("team-2")
        Loaders->>Engine: store(team fields + owner refs)
        Executor->>TaskStore: complete(T2), unblock(T3)
    end

    rect rgb(255, 248, 240)
        Note over Executor: Step 3: Load members (spawns children)
        Executor->>TaskStore: claim() => T3
        Note over Executor: Query all AcmeTeam refs from store
        Executor->>TaskStore: enqueue(C1: load-collection team-1)
        Executor->>TaskStore: enqueue(C2: load-collection team-2)
        Executor->>TaskStore: setAwaitingChildren(T3)

        Executor->>TaskStore: claim() => C1
        Executor->>Loaders: TeamMembersLoader.load(team-1)
        Loaders->>API: listMembers("team-1")
        API-->>Loaders: [{userId: "u1"}, {userId: "u2"}]
        Loaders->>Engine: store(AcmeUser "u1"), store(AcmeUser "u2")
        Executor->>TaskStore: complete(C1)

        Executor->>TaskStore: claim() => C2
        Executor->>Loaders: TeamMembersLoader.load(team-2)
        Loaders->>API: listMembers("team-2")
        API-->>Loaders: [{userId: "u3"}]
        Loaders->>Engine: store(AcmeUser "u3")
        Executor->>TaskStore: complete(C2)

        Note over Executor: All children done => complete(T3), unblock(T4)
    end

    rect rgb(248, 240, 255)
        Note over Executor: Step 4: Load user fields
        Executor->>TaskStore: claim() => T4
        Executor->>Loaders: BasicUserLoader.load([u1, u2, u3])
        Loaders->>API: users.getBatch(["u1", "u2", "u3"])
        Loaders->>Engine: store(user fields)
        Executor->>TaskStore: complete(T4)
    end

    Note over Executor: No active tasks => sync done
    Executor-->>Seeder: SyncResult { completed: 7, failed: 0 }
```

---

## Limitations & Future Work

### Not yet implemented

- **Loader dependencies (`dependsOn`)** — Loaders can declare dependencies on other loaders in the type system, but the execution layer ignores this. `DefaultTaskRunner` throws if a loader has dependencies. This blocks any loader that needs shared data from another loader.

- **Raw loaders** — `Loader.raw()` exists in the type system but the execution layer can't run it. There's no task payload type and no dispatch path. Raw loaders are intended for standalone data fetches (API config, rate limits) and are the primary use case for `dependsOn`. These two items are coupled.

- **Error recovery / resume** — When a sync has failures, stranded tasks remain in honest states. A resume mechanism could retry failed tasks and naturally unblock the rest. The state model supports this; the trigger mechanism doesn't exist yet.

### Current inefficiencies

- **Loaders run inline, not as tasks** — A `sync-step` task resolves its loaders and calls them directly. This means there's no opportunity for the system to deduplicate or batch across steps. If step 3 discovers users u1, u2, u3 and step 4 also needs u1, u2, u3, they're loaded independently.

  If loader calls were scheduled as tasks, two things become possible:
  1. **Deduplication** — multiple tasks wanting the same entity could coalesce into one load
  2. **Cross-step batching** — a batched loader could collect refs from many sources into a single API call

- **Single-threaded drain loop** — The executor claims one task at a time. For I/O-bound loaders, concurrent task execution would improve throughput significantly. The `FlowController` already exists for rate limiting and would pair naturally with concurrency.

See [ROADMAP.md](/ROADMAP.md) for the full list of planned work.

---

## Key Concepts Summary

| Concept | Role |
|---|---|
| **EntityDef** | Schema for an entity type (fields + types) |
| **Ref** | Typed pointer to an entity instance |
| **Loader** | Fetches data from an external API |
| **Resolver** | Maps entity fields to loaders |
| **Seeder** | Bootstraps a sync from cold start |
| **SyncPlan** | Ordered list of steps to execute |
| **Step** | Target (which entities) + operation (what to load) |
| **Task** | Serialisable unit of work in the execution layer |
| **SyncExecutor** | Orchestrates the drain loop |
| **TaskRunner** | Executes a single task (calls loaders, stores results) |
| **TaskStore** | Persists task state (supports restart/resume) |
| **SyncHandle** | Control and monitor a running sync |
