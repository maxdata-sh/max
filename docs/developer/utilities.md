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

## Quick Reference

| Utility | Purpose | Example |
|---------|---------|---------|
| `Batch<V, K>` | Batched results | `Batch.buildFrom(items).withKey(fn)` |
| `Page<T>` | Pagination | `Page.from(items, hasMore, cursor)` |
| `Id<Name>` | Soft-branded IDs | `type UserId = Id<"user-id">` |
| `Fields` | Field selection | `Fields.select("name", "email")` |
| `Scope` | Installation context | `Scope.local()`, `Scope.system(id)` |
| `StaticTypeCompanion` | Type+Value pattern | Documents dual-use names |
