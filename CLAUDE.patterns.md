# Code Patterns

Conventions for this codebase. Reference when working on Max.

## Type + Companion Object (Schematic Types Only)

Schematic types — data representations, type constructors, and structural helpers — use TypeScript namespace merging (one name for both type and value).

```typescript
// Definition pattern (in core)
export interface Ref<E, S> { ... }
export const Ref = StaticTypeCompanion({
  local(def, id) { ... },
  create(def, id, scope) { ... },
})

// Usage - one name, works as both
const ref: Ref<AcmeUser> = Ref.local(AcmeUser, "u1");
```

Applies to: `Ref`, `EntityDef`, `EntityResult`, `EntityInput`, `Page`, `Scope`, `RefKey`, `Fields` (and maybe others).
StaticTypeCompanion is a self-documenting (transparent) helper function marker from @max/core.

**Do NOT use this pattern for services.** Services (things with side effects, I/O, state) are plain classes with interfaces:

```typescript
// ✅ Services: interface + class, explicit construction
export interface ProjectManager { ... }
export class FsProjectManager implements ProjectManager { ... }
const pm = new FsProjectManager(startDir);

// ❌ Don't wrap services in companion objects
export const ProjectManager = StaticTypeCompanion({
  create(root: string): ProjectManager { ... }
});
```

The distinction: schematic types describe *what* something is. Services *do* things.

## Imports

Import without `type` modifier to get both type and value:

```typescript
// ✅ Good - gets both
import { Ref, EntityDef } from "@max/core";

// ❌ Avoid unless explicitly intended - only gets type
import type { Ref } from "@max/core";
```

## Scope

Refs are polymorphic over scope. Default is "any scope" for DX.

```typescript
Ref<E>              // Any scope (default) - use in most code
Ref<E, LocalScope>  // Explicitly local - use at boundaries
Ref<E, SystemScope> // Explicitly system - use at boundaries
```

Scope upgrade happens at boundaries between local/system engines.
`ScopeUpgradeable` marker interface indicates types that can upgrade.

The scope determines the context for this Maxwell object. As maxwell objects move up scope layers, they must be "upgraded". This attaches the required scope's context information (for example, an installationId).

## Brands

Type-safe nominal typing without runtime overhead.

```typescript
// SoftBrand - allows naked assignment (use for most IDs)
type EntityId = Id<"entity-id">;  // Id<N> = SoftBrand<string, N>
const id: EntityId = "u123";      // ✅ Works

// HardBrand - requires factory (use for validated/constructed values)
type RefKey = HardBrand<string, "ref-key">;
const key: RefKey = "...";        // ❌ Error
const key = RefKey.from(...);     // ✅ Must use factory
```

Common branded types: `EntityId`, `EntityType`, `InstallationId`, `RefKey`
