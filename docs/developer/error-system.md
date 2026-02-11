# Error System

MaxError is a composable error system with **boundaries**, **facets**, and **cause chains**. Errors are built from traits instead of class inheritance, with three discrimination axes: exact code, facet, or domain.

## Creating a boundary

Every domain that throws errors defines a boundary. This is the first line of your `errors.ts`:

```typescript
// connector-linear/src/errors.ts
import { MaxError } from "@max/core";

export const Linear = MaxError.boundary("linear");
```

The boundary owns all errors in your domain. It prefixes codes automatically and provides `is()` and `wrap()`.

Boundaries can declare contextual data that `wrap()` will require:

```typescript
import { MaxError, ErrFacet } from "@max/core";

export const LinearConnector = MaxError.boundary("linear_connector", {
  customProps: ErrFacet.props<{ connectorType: string; connectorId: string }>(),
});
```

When wrapping, the boundary data is carried on the thin boundary error (see [Wrapping](#wrapping)).

## Defining errors

Three things per error:

1. **Code** — just the suffix. The boundary prefixes the domain: `"auth_failed"` becomes `"linear.auth_failed"`
2. **Facets** — what categories does this error belong to? Standard markers (`NotFound`, `BadInput`) and data facets
3. **Message** — a function from data to a human-readable string. Keep it short; callers add detail via `context`

### Error-local data with customProps

Errors often carry data specific to their message. Use `customProps` to declare it:

```typescript
export const ErrIssueNotFound = Linear.define("issue_not_found", {
  customProps: ErrFacet.props<{ issueId: string }>(),
  facets: [NotFound],
  message: (d) => `Issue not found: ${d.issueId}`,
});
```

The `d` parameter is the intersection of customProps data and all facet data. Both are type-safe — `create()` requires them, `message()` can access them.

```typescript
// ✅ Typed — requires { issueId: string }
throw ErrIssueNotFound.create({ issueId: "ISS-123" });

// ❌ Compile error — missing issueId
throw ErrIssueNotFound.create({});
```

### When to use customProps vs. data facets

**customProps** — data specific to this error, used in its message. No catch-site discrimination needed.

```typescript
export const ErrMissingParam = Daemon.define("missing_param", {
  customProps: ErrFacet.props<{ param: string }>(),
  facets: [BadInput],
  message: (d) => `Missing required parameter: ${d.param}`,
});
```

**Data facets** — reusable semantic data that catch sites extract. Multiple errors share the same facet, and callers branch on it.

```typescript
const HasEntityRef = ErrFacet.data<{ entityType: string; entityId: string }>("HasEntityRef");

export const ErrEntityNotFound = Core.define("entity_not_found", {
  facets: [NotFound, HasEntityRef],
  message: (d) => `${d.entityType} not found: ${d.entityId}`,
});

// Catch site extracts structured data via the facet
if (MaxError.has(err, HasEntityRef)) {
  logEntityFailure(err.data.entityType, err.data.entityId);
}
```

**The upgrade path:** Start with customProps. When you notice multiple errors carrying the same shape of data, and catch sites want to branch on it, extract it into a data facet.

### Choosing facets

Facets answer "what category of thing happened?" — they're for catch-site logic, not documentation.

- **Use a marker facet** when callers will branch on it: `NotFound` -> return 404, `BadInput` -> show validation error
- **Use a data facet** when callers need structured info: `HasEntityRef` -> log the entity ID
- **Use no facets** when the error is self-explanatory by its code alone
- **Don't force-fit a facet.** `ErrAuthFailed` isn't `BadInput` — the user didn't provide bad input, the system isn't configured

### Standard facets

| Facet | Kind | When to use |
|-------|------|-------------|
| `NotFound` | marker | Something expected doesn't exist |
| `BadInput` | marker | Caller-supplied data failed validation |
| `NotImplemented` | marker | Code path not yet built |
| `Invariant` | marker | Should never happen — always a bug |
| `HasEntityRef` | data: `{ entityType, entityId }` | Error relates to a specific entity |
| `HasField` | data: `{ entityType, field }` | Error relates to a specific field |
| `HasLoaderName` | data: `{ loaderName }` | Error relates to a specific loader |

## Throwing errors

```typescript
// Data is typed from customProps + facets
throw ErrIssueNotFound.create({ issueId: "ISS-123" });

// Optional context string — appended with " — "
throw ErrIssueNotFound.create({ issueId: "ISS-123" }, "during sync");
// Message: "Issue not found: ISS-123 — during sync"

// Optional cause — for manual chaining without wrap()
throw ErrLinearSyncFailed.create({}, "page 3 of issues", innerError);
```

## Wrapping

There are two wrapping mechanisms, serving distinct purposes.

### ErrorDef.wrap — intent wrapping

"Run this function. If it fails, the error is X."

This has nothing to do with boundaries. It's a convenience on any `ErrorDef` that try/catches and wraps the thrown error as a cause:

```typescript
const issues = await ErrSyncFailed.wrap(async () => {
  return await linearApi.fetchAllIssues();
});
```

If the API call fails, you get `linear.sync_failed` with the original error as the cause.

If the ErrorDef requires data (from customProps or data facets), pass it as the first argument:

```typescript
await ErrSyncFailed.wrap({ source: "linear" }, async () => {
  return await linearApi.fetchAllIssues();
});
```

### Boundary.wrap — domain entry

"You're entering this boundary. Here's the context."

Use this at the entry point to a domain. If anything escapes, the boundary wraps it in a thin `{domain}.error` carrying the provided contextual data:

```typescript
await LinearConnector.wrap(
  { connectorType: "linear", connectorId: "lin_123" },
  async () => {
    const issues = await fetchAllIssues();
    await storeIssues(issues);
  },
);
```

If `storeIssues` throws a storage error, the cause chain becomes:
```
linear_connector.error { connectorType: "linear", connectorId: "lin_123" }
  └ caused by: storage.write_failed
    └ caused by: <original cause>
```

For boundaries without declared data, the data argument is omitted:

```typescript
await Linear.wrap(async () => {
  await route(req);
});
```

### Rules

- **Same-domain errors pass through** — if code inside `Linear.wrap()` throws a Linear error, it won't be double-wrapped
- **Cross-domain errors are wrapped** with the original as `cause`
- **Plain `Error` / strings** are first converted to a generic MaxError, then used as cause
- **Compose naturally** — use `ErrorDef.wrap()` for specific operations inside a `Boundary.wrap()`:

```typescript
await LinearConnector.wrap({ connectorType: "linear", connectorId: "lin_123" }, async () => {
  const issues = await ErrSyncFailed.wrap(() => linearApi.fetchIssues());
  await ErrStoreFailed.wrap(() => storeIssues(issues));
});
```

## Catching errors

Three discrimination axes — use the narrowest one that fits:

```typescript
try {
  await linear.sync();
} catch (err) {
  // Exact type — "is this specific error?"
  if (ErrIssueNotFound.is(err)) {
    console.log(err.data.issueId);  // typed from customProps + facets
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

## Displaying errors

### prettyPrint

`prettyPrint()` renders an error with its full cause chain in a readable format:

```typescript
if (MaxError.isMaxError(err)) {
  console.error(err.prettyPrint({ color: true }));
}
```

Output:
```
daemon.connector_not_found: Unknown connector: bogus
  {"connector":"bogus"}
  └ caused by: linear.sync_failed: Sync failed
    └ caused by: unknown: ECONNREFUSED
```

Options:
- `color` — ANSI color codes (error code in red, data and cause labels dimmed)
- `includeStackTrace` — append the stack trace at the end

### toJSON

`toJSON()` returns a structured object for logging pipelines. Cause chains serialize recursively:

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

## Core errors

The `Core` boundary provides infrastructure errors. Prefer defining domain-owned errors — seeing `core.*` in production logs is a signal to go define a proper domain error.

| Error | Code | Facets | customProps |
|-------|------|--------|-------------|
| `ErrInvalidRefKey` | `core.invalid_ref_key` | `BadInput` | `{ key: string }` |
| `ErrFieldNotLoaded` | `core.field_not_loaded` | `Invariant`, `HasField` | — |
| `ErrLoaderResultNotAvailable` | `core.loader_result_not_available` | `NotFound`, `HasLoaderName` | — |
| `ErrContextBuildFailed` | `core.context_build_failed` | `BadInput` | — |
| `ErrBatchKeyMissing` | `core.batch_key_missing` | `NotFound` | `{ key: string }` |
| `ErrBatchEmpty` | `core.batch_empty` | `Invariant` | — |
