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

Composable error system. Errors are built from **facets** (traits) instead of class inheritance, with three ways to discriminate: exact code, facet, or domain.

### Designing an error

Think about three things:

1. **Code** — a stable, hierarchical identifier like `"storage.entity_not_found"`. The prefix before the first `.` becomes the domain. Use your package/module name as the domain.
2. **Facets** — what categories does this error belong to? Compose from standard markers (`NotFound`, `BadInput`, `Invariant`, `NotImplemented`) and data facets (`HasEntityRef`, or define your own).
3. **Message** — a function that builds a human-readable string from the error data. Keep it short; callers add detail via `context`.

### Defining errors

```typescript
import { MaxError, ErrFacet, NotFound, HasEntityRef } from "@max/core";

// Use a standard error directly
throw ErrNotFound.create({}, "config key 'api_url'");

// Or define a domain-specific error
const ErrFileNotFound = MaxError.define("gdrive.file_not_found", {
  facets: [NotFound, HasEntityRef],
  message: (d) => `File not found: ${d.entityId}`,
});

throw ErrFileNotFound.create(
  { entityType: "File", entityId: "abc-123" },
  "during sync",  // optional context, appended with " — "
);
```

### Catching errors

Three discrimination axes — use the narrowest one that fits:

```typescript
try {
  await sync();
} catch (err) {
  // Exact type — "is this specific error?"
  if (ErrFileNotFound.is(err)) {
    console.log(err.data.entityId);  // typed
  }

  // By facet — "is this any kind of not-found?"
  if (MaxError.has(err, NotFound)) {
    return 404;
  }

  // By domain — "did this come from gdrive?"
  if (MaxError.inDomain(err, "gdrive")) {
    reportToGDriveMonitor(err);
  }
}
```

### Enriching at boundaries

Add data as errors propagate up the stack:

```typescript
const HasInstallation = ErrFacet.data<{
  installationId: string;
  name?: string;
}>("HasInstallation");

// In middleware / boundary layer
catch (err) {
  if (MaxError.isMaxError(err)) {
    MaxError.enrich(err, HasInstallation, { installationId: ctx.installationId });
  }
  throw err;
}
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

**Ready-to-use errors:**

| Error | Code | Facets |
|-------|------|--------|
| `ErrNotFound` | `core.not_found` | `NotFound` |
| `ErrEntityNotFound` | `core.entity_not_found` | `NotFound`, `HasEntityRef` |
| `ErrBadInput` | `core.bad_input` | `BadInput` |
| `ErrNotImplemented` | `core.not_implemented` | `NotImplemented` |
| `ErrInvariant` | `core.invariant` | `Invariant` |

All accept an optional `context` string at the throw site for specifics:

```typescript
throw ErrBadInput.create({}, "API key is required");
throw ErrNotImplemented.create({}, "loadCollection");
throw ErrInvariant.create({}, "batch was empty after resolve");
```

### Serialization

`err.toJSON()` returns a structured object safe for logging pipelines:

```json
{
  "code": "storage.entity_not_found",
  "domain": "storage",
  "message": "File not found: abc-123 — during sync",
  "context": "during sync",
  "data": { "entityType": "File", "entityId": "abc-123" },
  "facets": ["NotFound", "HasEntityRef"]
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
