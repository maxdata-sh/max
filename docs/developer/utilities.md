# Core Utilities & Patterns

Utilities and patterns used throughout Max.

## Batch<V, K>

Container for batch operation results. Maps keys to values with tracking.

```typescript
// Build from list with key extractor
const batch = Batch.buildFrom(users).withKey(user => user.id);

// Access
batch.get("u1");        // User | undefined
batch.getOrThrow("u1"); // User (throws if missing)
batch.values();         // User[] (self-contained)

// Tracking
batch.isFullyResolved;  // boolean
batch.unresolvableKeys; // Set<string>
```

**Key principle:** Values should be self-contained (include their key).

**Common patterns:**
```typescript
// From EntityInputs
Batch.buildFrom(inputs).withKey(i => i.ref)

// From items with .id
Batch.byId(users)

// From record
Batch.fromRecord({ a: 1, b: 2 })
```

---

## Page<T>

Pagination wrapper for collection results.

```typescript
interface Page<T> {
  items: T[];
  hasMore: boolean;
  cursor?: string;
  total?: number;
}

// Create
const page = Page.from(items, hasMore, cursor);

// Use
if (page.hasMore) {
  const next = await loadNext(page.cursor);
}
```

---

## Brand

Type-safe nominal typing without runtime overhead.

### SoftBrand
Allows naked assignment - use for IDs.

```typescript
type UserId = Id<"user-id">;  // Id<N> = SoftBrand<string, N>
const id: UserId = "u123";     // ✅ Works
const id2: string = id;        // ✅ Works

type OrderId = Id<"order-id">;
const orderId: OrderId = id;   // ❌ Error - different brands
```

### HardBrand
Requires factory - use for validated values.

```typescript
type RefKey = HardBrand<string, "ref-key">;
const key: RefKey = "...";        // ❌ Error
const key = RefKey.from(...);     // ✅ Must use factory
```

**Common branded types:**
- `EntityType`, `EntityId`, `InstallationId` - SoftBrand
- `RefKey` - HardBrand (requires parsing)
- `LoaderName` - SoftBrand

---

## Type + Companion Object Pattern

Infrastructure types use namespace merging - one name for both type and value.

```typescript
// Definition
export interface Ref<E, S> { ... }
export const Ref = StaticTypeCompanion({
  local(def, id) { ... },
  create(def, id, scope) { ... },
})

// Usage - one name works as both
const ref: Ref<AcmeUser> = Ref.local(AcmeUser, "u1");
```

**Applies to:** `Ref`, `EntityDef`, `EntityResult`, `EntityInput`, `Page`, `Scope`, `Fields`, `Loader`, `Resolver`, `Batch`

**Import:** Use bare import (no `type` modifier) to get both type and value.

```typescript
// ✅ Good - gets both
import { Ref, EntityDef } from "@max/core";

// ❌ Avoid - only gets type
import type { Ref } from "@max/core";
```

**StaticTypeCompanion** is a zero-runtime marker function that documents the pattern.

---

## Fields Selector

Explicit field selection for partial loading.

```typescript
// Load specific fields
await engine.load(ref, Fields.select("name", "email"));

// Load all fields
await engine.load(ref, Fields.ALL);
```

---

## Keyable

Objects that can be used as batch keys implement `toKey()`.

```typescript
interface Keyable {
  toKey(): string;
}

// Ref implements this
const ref = AcmeUser.ref("u1");
ref.toKey();  // "local:AcmeUser:u1"

// Use in batches
Batch.buildFrom(items).withKey(item => item.ref);  // Works!
```

---

## Inspect

Custom `console.log` rendering for classes. Assigns once to the prototype via a `static {}` block — no per-instance cost.

```typescript
import { inspect, Inspect } from "@max/core";

class TaskRunner {
  name: string;
  status: string;
  config: object;

  static {
    Inspect(this, (self) => ({
      format: "TaskRunner( %s | status=%s | %O )",
      params: [self.name, self.status, self.config],
    }));
  }
}
```

`console.log(runner)` outputs:
```
TaskRunner( my-runner | status=running | { retries: 3, timeout: 5000 } )
```

The format string uses `util.formatWithOptions` specifiers:
- `%s` — string (no quotes, no color)
- `%O` — object (colored, depth-aware, auto-expands when large)
- `%d` — number

---

## MaxError

Composable error system with **boundaries** and **cause chains**. Errors are built from facets (traits) instead of class inheritance, with three discrimination axes: exact code, facet, or domain.

### 1. Create your boundary

Every domain that throws errors defines a boundary. This is the first line of your `errors.ts`:

```typescript
// connector-linear/src/errors.ts
import { MaxError, ErrFacet, NotFound, BadInput } from "@max/core";

const Linear = MaxError.boundary("linear");
```

The boundary owns all errors in your domain. It prefixes codes automatically and provides `is()` and `wrap()`.

### 2. Define your errors

Think about three things per error:
- **Code** — the suffix (boundary prefixes the domain): `"auth_failed"` → `"linear.auth_failed"`
- **Facets** — what categories? Compose from standard markers and data facets
- **Message** — a function from data → string. Keep it short; callers add detail via `context`

```typescript
// Domain-specific data facet
const HasIssueRef = ErrFacet.data<{ issueId: string }>("HasIssueRef");

export const ErrAuthFailed = Linear.define("auth_failed", {
  facets: [BadInput],
  message: () => "Not authenticated — run 'max connect linear' first",
});

export const ErrIssueNotFound = Linear.define("issue_not_found", {
  facets: [NotFound, HasIssueRef],
  message: (d) => `Issue not found: ${d.issueId}`,
});

export { Linear };  // re-export for wrap() and is()
```

### 3. Throw errors

```typescript
throw ErrIssueNotFound.create(
  { issueId: "ISS-123" },         // data — typed from facets
  "during sync",                   // context — appended with " — "
);
```

### 4. Wrap boundaries

Use `wrap()` at domain entry points to build cause chains. Two forms:

```typescript
// Intent wrap — "I was trying to sync"
await Linear.wrap(ErrLinearSyncFailed, async () => {
  await Storage.wrap(ErrWriteFailed, async () => {
    await db.insertMany(issues);
  });
});

// Safety net — catches anything that escapes without an intent wrap
// Uses generic "linear.error" code
await Linear.wrap(async () => {
  await handleRequest(req);
});
```

Rules:
- Same-domain errors **pass through** unwrapped (no double-wrapping)
- Cross-domain errors are wrapped with the original as `cause`
- Plain `Error` / strings are first wrapped into a generic MaxError, then used as cause

### 5. Catch errors

Three discrimination axes — use the narrowest one that fits:

```typescript
try {
  await linear.sync();
} catch (err) {
  // Exact type — "is this specific error?"
  if (ErrIssueNotFound.is(err)) {
    console.log(err.data.issueId);  // typed
  }

  // By facet — "is this any kind of not-found?"
  if (MaxError.has(err, NotFound)) {
    return 404;
  }

  // By boundary — "did Linear fail?"
  if (Linear.is(err)) {
    reportToLinearMonitor(err);
  }

  // Walk the cause chain
  if (MaxError.isMaxError(err) && err.cause) {
    console.log("caused by:", err.cause.code);
  }
}
```

### 6. Import shared boundaries

Cross-cutting boundaries (storage, serialization, etc.) are imported and used like any other:

```typescript
import { Storage, ErrWriteFailed } from "@max/storage-sqlite";
import { Linear, ErrLinearSyncFailed } from "./errors.js";

await Linear.wrap(ErrLinearSyncFailed, async () => {
  await Storage.wrap(ErrWriteFailed, async () => {
    await db.insertMany(issues);
  });
});
// Chain: linear.sync_failed → storage.write_failed → <cause>
```

### Standard facets and errors

**Facets** (compose into your own errors):

| Facet | Kind | Data |
|-------|------|------|
| `NotFound` | marker | — |
| `BadInput` | marker | — |
| `NotImplemented` | marker | — |
| `Invariant` | marker | — |
| `HasEntityRef` | data | `{ entityType, entityId }` |

**Core errors** (use sparingly — prefer defining domain-owned errors):

| Error | Code | Facets |
|-------|------|--------|
| `ErrNotFound` | `core.not_found` | `NotFound` |
| `ErrEntityNotFound` | `core.entity_not_found` | `NotFound`, `HasEntityRef` |
| `ErrBadInput` | `core.bad_input` | `BadInput` |
| `ErrNotImplemented` | `core.not_implemented` | `NotImplemented` |
| `ErrInvariant` | `core.invariant` | `Invariant` |

### Serialization

`err.toJSON()` returns a structured object safe for logging pipelines. Cause chains are serialized recursively:

```json
{
  "code": "linear.sync_failed",
  "domain": "linear",
  "message": "Sync failed",
  "data": {},
  "facets": [],
  "cause": {
    "code": "storage.write_failed",
    "domain": "storage",
    "message": "Write failed",
    "data": { "entityType": "LinearIssue", "entityId": "ISS-123" },
    "facets": ["HasEntityRef"]
  }
}
```

---

## Quick Reference

| Utility | Purpose | Example |
|---------|---------|---------|
| `Batch<V, K>` | Batched results | `Batch.buildFrom(items).withKey(fn)` |
| `Page<T>` | Pagination | `Page.from(items, hasMore, cursor)` |
| `Id<Name>` | Soft-branded IDs | `type UserId = Id<"user-id">` |
| `Fields` | Field selection | `Fields.select("name", "email")` |
| `Scope` | Installation context | `Scope.local()`, `Scope.system(id)` |
| `StaticTypeCompanion` | Type+Value pattern | Documents dual-use names |
| `Inspect` | Custom console.log | `Inspect(this, self => ({ format, params }))` |
| `MaxError` | Composable errors | `MaxError.define("domain.code", { facets, message })` |
| `ErrFacet` | Error traits | `ErrFacet.marker("NotFound")`, `ErrFacet.data<T>("HasRef")` |
