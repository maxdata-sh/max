# Pattern Guard

Post-tool-use patterns that trigger just-in-time guidance when Claude writes or edits code.

Each `##` section defines one pattern. Fields:

- **pattern**: regex (in backtick span) matched against written/edited content
- **frequency**: `always` (fire every time) or `once` (first detection per session)
- **files**: glob for which files to check (default: `*.ts,*.tsx`)

Everything after the fields is the guidance text injected into context.

---

## raw-throw
- pattern: `throw\s+new\s+Error\s*\(`
- frequency: always

This codebase uses MaxError with boundaries — never throw raw errors.
See docs/developer/error-system.md.
Create an errors.ts with MaxError.boundary("domain"), define errors with boundary.define("code", { facets, message }), and throw via ErrX.create().

## as-any
- pattern: `\bas\s+(any|unknown)\b`
- frequency: always

"as any" or "as unknown" cast detected. This is a signal that something is wrong with the domain model or type ontology — you are working around a friction rather than resolving it.
STOP: articulate what tension you are encountering, and we will resolve it together rather than casting through it.

## soft-brand-cast
- pattern: `\bas\s+\w+Id\b`
- frequency: once

Casting to a branded Id type detected (e.g. "as EntityId"). This codebase uses soft brands (SoftBrand<string, N>) for Id types — plain strings are automatically assignable without casting. Remove the "as" cast; it is unnecessary and adds noise. Only HardBrand types (like RefKey) require factory functions.
