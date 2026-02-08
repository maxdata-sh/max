# Error System

MaxError is a composable error system with **boundaries** and **cause chains**. Errors are built from facets (traits) instead of class inheritance, with three discrimination axes: exact code, facet, or domain.

## Creating a boundary

Every domain that throws errors defines a boundary. This is the first line of your `errors.ts`:

```typescript
// connector-linear/src/errors.ts
import { MaxError, ErrFacet, NotFound } from "@max/core";

export const Linear = MaxError.boundary("linear");
```

The boundary owns all errors in your domain. It prefixes codes automatically and provides `is()` and `wrap()`.

## Defining errors

Think about three things per error:

1. **Code** — just the suffix. The boundary prefixes the domain: `"auth_failed"` becomes `"linear.auth_failed"`
2. **Facets** — what categories does this error belong to? Compose from standard markers (`NotFound`, `BadInput`, etc.) and data facets
3. **Message** — a function from data to a human-readable string. Keep it short; callers add detail via `context`

```typescript
// Domain-specific data facet
const HasIssue = ErrFacet.data<{ issueId: string }>("HasIssue");

export const ErrLinearAuthFailed = Linear.define("auth_failed", {
  facets: [],
  message: () => "Not authenticated — run 'max connect linear' first",
});

export const ErrIssueNotFound = Linear.define("issue_not_found", {
  facets: [NotFound, HasIssue],
  message: (d) => `Issue not found: ${d.issueId}`,
});

export const ErrLinearSyncFailed = Linear.define("sync_failed", {
  facets: [],
  message: () => "Linear sync failed",
});
```

### Choosing facets

Facets answer "what category of thing happened?" — they're for catch-site logic, not documentation.

- **Use a marker facet** when callers will branch on it: `NotFound` → return 404, `BadInput` → show validation error
- **Use a data facet** when callers need structured info: `HasIssue` → log the issue ID
- **Use no facets** when the error is self-explanatory by its code alone: `ErrLinearAuthFailed` doesn't need a marker because callers match it by exact type or by the `Linear` boundary

Don't force-fit a facet. `ErrAuthFailed` isn't `BadInput` — the user didn't provide bad input, the system isn't configured.

### Standard facets

| Facet | Kind | When to use |
|-------|------|-------------|
| `NotFound` | marker | Something expected doesn't exist |
| `BadInput` | marker | Caller-supplied data failed validation |
| `NotImplemented` | marker | Code path not yet built |
| `Invariant` | marker | Should never happen — always a bug |
| `HasEntityRef` | data: `{ entityType, entityId }` | Error relates to a specific entity |

## Throwing errors

```typescript
// Data is typed from the facets
throw ErrIssueNotFound.create({ issueId: "ISS-123" });

// Optional context string — appended with " — "
throw ErrIssueNotFound.create({ issueId: "ISS-123" }, "during sync");
// Message: "Issue not found: ISS-123 — during sync"

// Optional cause — for manual chaining without wrap()
throw ErrLinearSyncFailed.create({}, "page 3 of issues", innerError);
```

## Wrapping boundaries

Use `wrap()` at domain entry points to build cause chains automatically:

```typescript
// connector-linear/src/sync.ts
import { Linear, ErrLinearSyncFailed } from "./errors.js";

export async function sync() {
  // Intent wrap — "I was trying to sync"
  await Linear.wrap(ErrLinearSyncFailed, async () => {
    const issues = await fetchAllIssues();
    await storeIssues(issues);  // internally uses Storage boundary
  });
}
```

If `storeIssues` throws a storage error, it becomes:
```
linear.sync_failed → storage.write_failed → <original cause>
```

You can also use the safety-net form at a domain's top-level entry point:

```typescript
// connector-linear/src/index.ts
export async function handleRequest(req: Request) {
  // Catches anything that escapes without a specific intent wrap
  // Uses generic "linear.error" code
  await Linear.wrap(async () => {
    await route(req);
  });
}
```

### Rules

- **Same-domain errors pass through** — if `storeIssues` throws a Linear error, it won't be double-wrapped
- **Cross-domain errors are wrapped** with the original as `cause`
- **Plain `Error` / strings** are first wrapped into a generic MaxError, then used as cause
- **Each code site wraps its own boundary** — you shouldn't see two different boundaries in the same function. If you're calling the database, the storage boundary lives inside the database module, not at your call site

## Catching errors

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
    console.log("root cause:", err.cause.code);
  }
}
```

## Shared boundaries

Some boundaries are cross-cutting — storage, serialization, network. These live in their respective packages and are used internally by any domain that needs them:

```typescript
// storage-sqlite/src/errors.ts
export const Storage = MaxError.boundary("storage");
export const ErrWriteFailed = Storage.define("write_failed", { ... });

// storage-sqlite/src/engine.ts — wraps internally
import { Storage, ErrWriteFailed } from "./errors.js";

export async function save(entity: Entity) {
  await Storage.wrap(ErrWriteFailed, async () => {
    await db.insert(entity);
  });
}
```

From the caller's perspective, they just call `save()`. If it fails, the error chain includes the storage boundary automatically. The caller only wraps their own boundary:

```typescript
// connector-linear/src/sync.ts
await Linear.wrap(ErrLinearSyncFailed, async () => {
  await save(issue);  // Storage boundary is internal to save()
});
```

## Core errors

The `Core` boundary provides a small set of generic errors. Use these sparingly — prefer defining domain-owned errors:

| Error | Code | Facets |
|-------|------|--------|
| `ErrNotFound` | `core.not_found` | `NotFound` |
| `ErrEntityNotFound` | `core.entity_not_found` | `NotFound`, `HasEntityRef` |
| `ErrBadInput` | `core.bad_input` | `BadInput` |
| `ErrNotImplemented` | `core.not_implemented` | `NotImplemented` |
| `ErrInvariant` | `core.invariant` | `Invariant` |

Seeing `core.*` errors in production logs is a signal to go define a proper domain error.

## Serialization

`err.toJSON()` returns a structured object safe for logging pipelines. Cause chains are serialized recursively:

```json
{
  "code": "linear.sync_failed",
  "domain": "linear",
  "message": "Linear sync failed",
  "data": {},
  "facets": [],
  "cause": {
    "code": "storage.write_failed",
    "domain": "storage",
    "message": "Write failed",
    "data": {},
    "facets": []
  }
}
```

## Console output

Errors render with the code in red, data block, stack frames, and cause chain:

```
MaxError[linear.sync_failed]: Linear sync failed
    at sync (/src/connector-linear/sync.ts:12:5)
  caused by: MaxError[storage.write_failed]: Write failed
    { entityType: "LinearIssue", entityId: "ISS-123" }
      at save (/src/storage-sqlite/engine.ts:28:7)
```
