# Core Concepts

Fundamental concepts in Max.

## Ref

A **Ref** is a typed reference to an entity.

```typescript
const userRef = AcmeUser.ref("u123");

userRef.entityDef;   // AcmeUser
userRef.entityType;  // "AcmeUser"
userRef.id;          // "u123"
userRef.scope;       // LocalScope or SystemScope
```

**Refs are rich objects** that carry:
- The entity type (runtime)
- The entity ID
- Scope information (local vs system)

**Creating refs:**
```typescript
AcmeUser.ref("u123")                 // Local scope (default)
AcmeUser.ref("u123", Scope.system("inst_456"))  // System scope
```

**Using refs:**
```typescript
// Load an entity
const user = await engine.load(userRef, Fields.ALL);

// Follow references
const teamRef = user.fields.team;  // Ref<AcmeTeam>
const team = await engine.load(teamRef, Fields.select("name"));
```

---

## Scope

**Scope** defines the installation context for refs and entities.

### LocalScope
Single installation - no installation ID needed.
```typescript
Scope.local()
```

### SystemScope
Multi-installation/multi-tenant - requires installation ID.
```typescript
Scope.system("inst_456")
```

**Why scope matters:**

In local mode (developer laptop), everything is local scope - one installation.

In system mode (enterprise deployment), refs carry installation IDs to distinguish entities across tenants.

**Scope upgrade:**
```typescript
const localRef = AcmeUser.ref("u1");  // Local scope
const systemRef = localRef.upgradeScope(Scope.system("inst_456"));  // System scope
```

**Default:** Most code uses local scope. System scope is for multi-tenant deployments.

---

## EntityDef

An **EntityDef** defines an entity type and its fields.

```typescript
interface AcmeUser extends EntityDef<{
  name: ScalarField<"string">;
  email: ScalarField<"string">;
}> {}

const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
});
```

**Pattern:** Interface + const with same name (Type + Companion Object).

**AcmeUser works as:**
- **Type**: `Ref<AcmeUser>`, `EntityInput<AcmeUser>`
- **Value**: `AcmeUser.ref("u1")`, `EntityDef.create(...)`

---

## EntityInput

A complete upsert request - ref + fields.

```typescript
const input = EntityInput.create(AcmeUser.ref("u1"), {
  name: "Alice",
  email: "alice@example.com",
});

await engine.store(input);
```

**Why it's useful:**
- Can be passed around / returned from functions
- Loaders return EntityInput
- Self-contained (has ref + data)

---

## EntityResult

Wrapper around loaded entity data with type-safe field access.

```typescript
const result = await engine.load(userRef, Fields.select("name", "email"));

// Access via .get()
result.get("name");     // string
result.get("email");    // string

// Access via .fields (proxy)
result.fields.name;     // string
result.fields.email;    // string

// @ts-error - 'age' not loaded
result.get("age");
```

**Only loaded fields are accessible** - type-safe partial loading.
