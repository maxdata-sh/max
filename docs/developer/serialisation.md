# Serialisation

Strategy for serialising and deserialising Maxwell types across boundaries.

## The Problem

Serialisation is trivial — most types flatten to JSON naturally. Deserialisation is where it gets hard. When a `Page<EntityInput<User>>` arrives as JSON, the receiving side needs to know:

1. The outer structure is a `Page`
2. The items are `EntityInput`s
3. The entity schema is `User` (with its field definitions)
4. Nested types like `Ref` need their `EntityDef` and `Scope` to reconstruct

Generics are erased at runtime. There's no trace of `User` in the serialised bytes. The deserialiser must be told the schema.

This problem applies broadly — not just to entities. Sync task settings, action parameters, workflow inputs, and any structured type that crosses a boundary must round-trip cleanly.

## Boundaries

A **boundary** is anywhere data leaves one context and arrives in another. The schema available on the sending side may not be available on the receiving side unless we ensure it.

Known boundaries:

| Boundary | Direction | Examples |
|----------|-----------|---------|
| **Temporal activities** | In/out | Activity inputs and return values |
| **Persistent storage** | Write/read | SQLite rows, checkpoint data, cached results |
| **Cross-process IPC** | Send/receive | Messages between daemon and CLI |
| **API responses** | Serialise/parse | HTTP responses, webhook payloads |

The surface area is not fully known yet. New boundaries will emerge as the system grows (queues, external integrations, etc.). The strategy must handle this without requiring changes to the types themselves.

## Approach: Codecs

A **codec** is a paired serialiser/deserialiser for a specific type. It lives at the boundary, not on the type.

```typescript
interface Codec<T> {
  serialize(value: T): unknown    // JSON-safe output
  deserialize(raw: unknown): T    // Reconstruct from JSON
}
```

### Why codecs, not toJSON/fromJSON

- **Types stay clean.** `Page` is about pagination, not serialisation. No `toJSON` methods cluttering the domain.
- **Different boundaries, different strategies.** Cache storage might use a compact binary format. Temporal might use its native payload converter. API responses use JSON. Same types, same codec interface, different backing implementations.
- **No speculative work.** Build a codec when a type first crosses a boundary. Types that never leave the process never need one.
- **Explicit and auditable.** The codec composition tree shows exactly what's being serialised and how. No hidden magic.

### Composition

Codecs compose from smaller codecs, like building blocks:

```typescript
// Primitives
Codec.string
Codec.number

// Composites
Codec.array(Codec.string)                  // string[]
Codec.optional(Codec.number)               // number | undefined
Codec.page(Codec.string)                   // Page<string>
Codec.ref(User)                            // Ref<User>

// Structured objects
const SyncSettingsCodec = Codec.object({
  schedule: Codec.string,
  batchSize: Codec.number,
  retryPolicy: Codec.optional(RetryPolicyCodec),
})

// Deep nesting composes naturally
const UserPageCodec = Codec.page(EntityInput.codec(User))
```

### Schema at the Boundary

The critical requirement: **the schema must be available on both sides of the boundary.**

When an entity crosses a boundary and comes back, the receiving side needs the `EntityDef` to reconstruct `Ref`s, `EntityInput`s, and other schema-dependent types. This means boundaries need access to a schema registry — a mapping from entity type names to their definitions.

```typescript
// At a Temporal activity boundary
const fetchUsers = defineActivity({
  input: SyncSettingsCodec,
  output: Codec.page(EntityInput.codec(User)),
  fn: async (settings) => { ... }
})
```

The activity definition pairs the function signature with its codecs. If the codec doesn't match the return type, the compiler complains. The codec carries the schema knowledge (e.g. `User`) so the deserialising side knows how to reconstruct the result.

For broader registry-based deserialisation (where the type isn't known statically), the boundary must have access to the full set of entity definitions:

```typescript
// A schema registry available at the boundary
interface SchemaRegistry {
  getEntityDef(entityType: EntityType): EntityDefAny
}

// The boundary uses this to resolve types during deserialisation
const codec = Codec.entityInput(registry)  // looks up EntityDef by entityType in the payload
```

### Swappable Strategies

Because `Codec<T>` is an interface, the implementation behind it can vary:

- **JSON** — the default, works everywhere
- **Temporal payload converters** — hook into Temporal's native serialisation
- **Binary formats** — MessagePack, protobuf, etc. for performance-sensitive paths
- **Compressed** — wrapping any codec with compression for large payloads

The consuming code doesn't know or care which strategy is in use.

## Status

Not yet implemented. The approach is settled; implementation will happen when we hit the first real serialisation boundary (likely Temporal integration). Until then, the design constraint is: **keep types codec-friendly** — meaning plain data, no closures or non-serialisable state in types that may cross boundaries.

## Types Likely to Need Codecs

Non-exhaustive, will grow as boundaries emerge:

- `Page<T>`, `PageRequest`, `MaxPage<E, S>`
- `Ref<E, S>`, `EntityInput<E>`, `EntityResult<E>`
- `Batch<V, K>`
- `MaxError` (structured via `toJSON` already)
- Sync task settings and configuration
- Action descriptors with parameters
- Workflow inputs and checkpoint state
