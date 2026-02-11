# Connector Interface Spec

The interface between Max and external systems. Defines how connectors declare their schema, onboard users, initialise runtime services, and interact with the platform.

## Concepts

**ConnectorSchema** — Immutable class representing a connector's data model. Entity defs, root entities, relationships, namespace. Helper methods for navigation. No runtime behaviour. Passable independently of the connector itself — useful when only entity definitions matter.

**ConnectorDef** — Static descriptor of a connector type. Carries schema, onboarding flow, identity (name, display name, description, icon), version, required scopes. Pure data — no factory methods, no runtime logic. The resolvers and seeder are declared here since they are static.

**ConnectorModule** — The bundled export from a connector package. Pairs a ConnectorDef with an `initialise` function. This is what the platform imports and what the registry resolves to.

**ConnectorRegistry** — Maps connector identifiers to their modules. Supports local modules (in the codebase) and, in future, remote modules (downloaded from an external registry). The platform uses the registry to resolve connector names to loadable modules at startup.

**Installation** — A live, configured instance of a connector. Built by `initialise(config, credentialStore)`. Owns its context and lifecycle. Multiple installations per connector, multiple connectors per tenant. Identified by both a user-facing slug and a platform-assigned UID.

**Config** — Plain configuration produced by onboarding: workspace IDs, project selections, sync preferences. No secrets. Typed per-connector, opaque to the platform.

**CredentialStore** — A platform-provided service scoped to an installation. Secrets enter the store during onboarding and never leave as raw values. Connectors access credentials through the store, which provides auditability, JIT resolution, and support for token rotation. The connector never holds raw secrets — only a reference to the store.

**Credential keys** — Typed references to secrets in the credential store. `Credential.key<T>` defines a stored secret (collected during onboarding). `Credential.derived<T>` defines a computed secret that is obtained from other credentials (e.g. an access token refreshed from a refresh token). Credential keys provide compile-time safety over what secrets exist and what types they resolve to.

**OnboardingFlow** — An ordered list of steps. Each step receives accumulated state from prior steps and contributes its output. Secrets are written directly into the credential store as they are collected — the onboarding result contains only plain config.

---

## Consumer Code (Platform Side)

### Connector registry

```typescript
import { ConnectorRegistry } from "@max/connector";

// Register available connectors
const registry = ConnectorRegistry.create({
  local: {
    linear: () => import("@max/connector-linear"),
    gdrive: () => import("@max/connector-gdrive"),
  },
  // Future: remote registry support
  // remote: "https://registry.max.dev/connectors",
});

// Resolve a connector by name
const linearModule = await registry.resolve("linear");  // ConnectorModule
```

### Discovering connectors

```typescript
// Schema available at import time — no instantiation
linearModule.def.schema.namespace           // "linear"
linearModule.def.schema.entities            // EntityDef[]
linearModule.def.schema.roots               // EntityDef[]
linearModule.def.schema.getDefinition("LinearIssue")  // EntityDef | undefined

// Identity
linearModule.def.name                       // "linear"
linearModule.def.displayName                // "Linear"
linearModule.def.description                // "Sync issues, projects, and teams from Linear"
linearModule.def.icon                       // "https://linear.app/icon.svg"
linearModule.def.version                    // "1.0.0"
linearModule.def.scopes                     // ["read:issues", "read:projects", ...]

// Static sync pieces — available without initialising
linearModule.def.resolvers                  // ResolverAny[]
linearModule.def.seeder                     // Seeder
```

### Running onboarding

```typescript
// Platform creates a credential store scoped to this installation
const credentialStore = platform.credentials.forInstallation(installationId);

// Platform drives the step pipeline, passing the credential store
// Secrets are written to the store during onboarding — they never appear in the result
const config = await platform.runOnboarding(linearModule.def.onboarding, { credentialStore });

// Only plain config is returned and stored
await platform.storeInstallationConfig(installationId, config);
```

### Initialising a connector

```typescript
// Normal startup — platform loads config, provides credential store
const config = await platform.loadInstallationConfig(installationId);
const credentialStore = platform.credentials.forInstallation(installationId);
const installation = linearModule.initialise(config, credentialStore);
await installation.start();

// For testing — skip onboarding, provide directly
const credentialStore = CredentialStore.testing({
  api_token: "test-key",
});
const installation = linearModule.initialise(
  { workspaceId: "ws-123" },
  credentialStore,
);
await installation.start();
```

### Sync (platform-driven)

```typescript
// Sync is a platform operation, not an installation method.
// The platform has the resolvers and seeder from the def,
// and the context from the installation.

// Full sync (cold start via seeder)
await platform.sync(installation);

// Targeted sync (future — specific entities or fields)
await platform.sync(installation, customPlan: SyncPlan);
```

### Lifecycle

```typescript
await installation.stop();
const health = await installation.health();
```

---

## Connector Author Code

### Package export (simple — Linear with API key)

```typescript
// connector-linear/src/index.ts
import { ConnectorModule, ConnectorDef, ConnectorSchema, Credential } from "@max/connector";
import { LinearIssue, LinearProject, LinearTeam, LinearUser, LinearRoot } from "./entities.js";
import { LinearOnboarding } from "./onboarding.js";
import { LinearIssueResolver, LinearTeamResolver, LinearUserResolver } from "./resolvers/index.js";
import { LinearSeeder } from "./seeder.js";

// Typed credential keys — the connector's credential "schema"
export const ApiToken = Credential.key<string>("api_token");

const LinearSchema = ConnectorSchema.create({
  namespace: "linear",
  entities: [LinearIssue, LinearProject, LinearTeam, LinearUser],
  roots: [LinearRoot],
});

const LinearDef = ConnectorDef.create({
  name: "linear",
  displayName: "Linear",
  description: "Sync issues, projects, and teams from Linear",
  icon: "https://linear.app/icon.svg",
  version: "1.0.0",
  scopes: ["read:issues", "read:projects", "read:teams", "read:users"],
  schema: LinearSchema,
  onboarding: LinearOnboarding,
  seeder: LinearSeeder,
  resolvers: [LinearIssueResolver, LinearTeamResolver, LinearUserResolver],
});

class LinearContext extends Context {
  client = Context.instance<LinearClient>()
  workspaceId = Context.string
}

export const Linear = ConnectorModule.create({
  def: LinearDef,

  initialise(config: LinearConfig, credentials: CredentialStore) {
    const linearClient = new linear.ApiClient({
      token: () => credentials.get(ApiToken),  // typed — returns Promise<string>
    })
    const context = Context.build(LinearContext, {
      client: linearClient,
      workspaceId: config.workspaceId,
    });

    return Installation.create({
      context,
    });
  },
});
```

### Package export (rotation — Google Drive with OAuth2)

```typescript
// connector-gdrive/src/index.ts
import { ConnectorModule, ConnectorDef, ConnectorSchema, Credential } from "@max/connector";
import { GDriveOnboarding } from "./onboarding.js";
// ...other imports

// Stored credential — collected during OAuth2 onboarding
export const RefreshToken = Credential.key<string>("refresh_token");

// Derived credential — auto-refreshes using the refresh token
export const AccessToken = Credential.derived<string>("access_token", {
  async refresh(store) {
    const refreshToken = await store.get(RefreshToken);
    const result = await google.oauth2.refresh({
      refreshToken,
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    });
    return result.access_token;
  },
  expiresIn: 3500,  // seconds — refresh before Google's 3600s expiry
});

// ...schema, def...

export const GDrive = ConnectorModule.create({
  def: GDriveDef,

  initialise(config: GDriveConfig, credentials: CredentialStore) {
    const driveClient = new google.drive.Client({
      // Just ask for AccessToken — the store handles refresh transparently
      token: () => credentials.get(AccessToken),
    });
    const context = Context.build(GDriveContext, {
      client: driveClient,
    });

    return Installation.create({
      context,
    });
  },
});
```

### Entities

```typescript
// connector-linear/src/entities.ts
import { EntityDef, Field } from "@max/core";

export interface LinearIssue extends EntityDef<{
  title: ScalarField<"string">;
  description: ScalarField<"string">;
  status: ScalarField<"string">;
  assignee: RefField<LinearUser>;
  project: RefField<LinearProject>;
}> {}

export const LinearIssue: LinearIssue = EntityDef.create("LinearIssue", {
  title: Field.string(),
  description: Field.string(),
  status: Field.string(),
  assignee: Field.ref(LinearUser),
  project: Field.ref(LinearProject),
});
```

### Config

```typescript
// connector-linear/src/config.ts

// Config — plain configuration, no secrets
export interface LinearConfig {
  workspaceId: string;
}
```

### Context

```typescript
// connector-linear/src/context.ts
// Contexts are pure shape declarations — no construction logic.
// initialise() builds them by wiring config values and service instances.

import { Context } from "@max/core";
import { LinearClient } from "./client.js";

export class LinearContext extends Context {
  client = Context.instance<LinearClient>();
  workspaceId = Context.string;
}
```

### Onboarding (simple — API key)

```typescript
// connector-linear/src/onboarding.ts
import { OnboardingFlow, InputStep, ValidationStep, SelectStep } from "@max/connector/onboarding";
import { ApiToken } from "./index.js";

export const LinearOnboarding = OnboardingFlow.create<LinearConfig>([
  InputStep.create({
    label: "API Key",
    description: "Create a personal API key at Linear > Settings > API",
    credentials: {
      api_token: ApiToken,  // typed key — platform writes to credential store
    },
  }),

  ValidationStep.create({
    label: "Verify credentials",
    async validate(accumulated, { credentialStore }) {
      const token = await credentialStore.get(ApiToken);  // typed
      const client = new LinearClient({ token });
      await client.viewer();
    },
  }),

  SelectStep.create({
    label: "Choose workspace",
    async options(accumulated, { credentialStore }) {
      const token = await credentialStore.get(ApiToken);  // typed
      const client = new LinearClient({ token });
      const workspaces = await client.workspaces();
      return workspaces.map(ws => ({
        label: ws.name,
        value: ws.id,
      }));
    },
    field: "workspaceId",
  }),
]);
```

### Onboarding (rotation — OAuth2)

```typescript
// connector-gdrive/src/onboarding.ts
import { OnboardingFlow, OAuth2Step, SelectStep } from "@max/connector/onboarding";
import { RefreshToken } from "./index.js";

export const GDriveOnboarding = OnboardingFlow.create<GDriveConfig>([
  OAuth2Step.create({
    label: "Connect Google account",
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    credential: RefreshToken,  // platform stores the refresh token after OAuth flow
  }),

  SelectStep.create({
    label: "Choose drive",
    async options(accumulated, { credentialStore }) {
      // Can use AccessToken here — derived credentials work during onboarding too
      const token = await credentialStore.get(AccessToken);
      const client = new google.drive.Client({ token });
      const drives = await client.drives.list();
      return drives.map(d => ({ label: d.name, value: d.id }));
    },
    field: "driveId",
  }),
]);
```

---

## Type Definitions

### ConnectorSchema

```typescript
class ConnectorSchema {
  readonly namespace: string;
  readonly entities: readonly EntityDefAny[];
  readonly roots: readonly EntityDefAny[];

  static create(opts: {
    namespace: string;
    entities: EntityDefAny[];
    roots: EntityDefAny[];
  }): ConnectorSchema;

  getDefinition(name: string): EntityDefAny | undefined;
  getDefinition(name: EntityType): EntityDefAny | undefined;

  // All entity types as strings
  get entityTypes(): readonly EntityType[];

  // Relationships derived from ref fields
  get relationships(): readonly EntityRelationship[];
}

interface EntityRelationship {
  from: EntityType;
  field: string;
  to: EntityType;
  cardinality: "one" | "many";
}
```

### ConnectorDef

```typescript
interface ConnectorDef<TConfig = unknown> {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly schema: ConnectorSchema;
  readonly onboarding: OnboardingFlow<TConfig>;
  readonly seeder: Seeder;
  readonly resolvers: readonly ResolverAny[];

  static create<TConfig>(opts: {
    name: string;
    displayName: string;
    description: string;
    icon: string;
    version: string;
    scopes: string[];
    schema: ConnectorSchema;
    onboarding: OnboardingFlow<TConfig>;
    seeder: Seeder;
    resolvers: ResolverAny[];
  }): ConnectorDef<TConfig>;
}
```

### ConnectorModule

```typescript
interface ConnectorModule<TConfig = unknown> {
  readonly def: ConnectorDef<TConfig>;
  initialise(config: TConfig, credentials: CredentialStore): Installation;

  static create<TConfig>(opts: {
    def: ConnectorDef<TConfig>;
    initialise: (config: TConfig, credentials: CredentialStore) => Installation;
  }): ConnectorModule<TConfig>;
}
```

### ConnectorRegistry

```typescript
interface ConnectorRegistry {
  resolve(name: string): Promise<ConnectorModule>;
  list(): Promise<ConnectorRegistryEntry[]>;

  static create(opts: {
    local: Record<string, () => Promise<{ default: ConnectorModule }>>;
    // Future: remote registry
  }): ConnectorRegistry;
}

interface ConnectorRegistryEntry {
  name: string;
  displayName: string;
  source: "local" | "remote";
}
```

### Installation

```typescript
interface Installation {
  // Context for this installation (used by the platform to run loaders)
  readonly context: Context;

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // MVP health check — will be extended with richer diagnostics
  // (e.g. per-subsystem health, last sync status, token expiry, rate limit headroom)
  health(): Promise<HealthStatus>;
}

type HealthStatus =
  | { status: "healthy" }
  | { status: "degraded"; reason: string }
  | { status: "unhealthy"; reason: string };
```

### Installation Identity

```typescript
// User-facing slug (like Docker container names)
type InstallationSlug = Id<"installation-slug">;  // e.g. "my-linear", "eng-gdrive"

// Platform-assigned UID (globally unique across federated estates)
type InstallationId = Id<"installation-id">;       // e.g. "inst_a1b2c3d4"

interface InstallationRecord {
  id: InstallationId;
  slug: InstallationSlug;
  connectorName: string;
  config: unknown;        // opaque, per-connector
  credentialRef: string;  // reference into credential store
  createdAt: Date;
}
```

### Credential

```typescript
// Typed reference to a secret in the credential store.
// Provides compile-time safety over what secrets exist and their types.

interface CredentialKey<T> {
  readonly name: string;
  readonly kind: "key";
}

interface DerivedCredential<T> {
  readonly name: string;
  readonly kind: "derived";
  readonly refresh: (store: CredentialStore) => Promise<T>;
  readonly expiresIn?: number;  // seconds
}

const Credential = {
  // A stored secret — collected during onboarding, lives in the credential store.
  key<T>(name: string): CredentialKey<T>;

  // A computed secret — derived from other credentials at runtime.
  // The store handles caching and refresh transparently.
  derived<T>(name: string, opts: {
    refresh: (store: CredentialStore) => Promise<T>;
    expiresIn?: number;
  }): DerivedCredential<T>;
};

type AnyCredential<T> = CredentialKey<T> | DerivedCredential<T>;
```

### CredentialStore

```typescript
// Platform-provided service for managing secrets scoped to an installation.
//
// NON-FUNCTIONAL REQUIREMENTS NOT YET ESTABLISHED:
// The full credential store design (encryption at rest, access audit logging,
// rotation policies, revocation, multi-backend support) is an exercise for
// a separate spec. This interface defines the contract that connectors program
// against. The initial implementation will be a basic key-value store backed
// by the local filesystem — sufficient to get moving, not production-grade.

interface CredentialStore {
  // Retrieve a secret by typed key. For derived credentials, handles refresh
  // transparently — returns cached value if fresh, refreshes if stale.
  get<T>(key: AnyCredential<T>): Promise<T>;

  // Store a secret by typed key. Used during onboarding.
  set<T>(key: CredentialKey<T>, value: T): Promise<void>;

  // Check if a credential exists without reading it.
  has(key: AnyCredential<unknown>): Promise<boolean>;

  // Remove a credential (e.g. on disconnect/uninstall).
  delete(key: AnyCredential<unknown>): Promise<void>;

  // List all credential keys for this installation (not values).
  keys(): Promise<string[]>;
}

// Testing utility — in-memory credential store for unit/integration tests.
const CredentialStore = {
  testing(initial?: Record<string, unknown>): CredentialStore;
};
```

### OnboardingFlow

```typescript
interface OnboardingFlow<TConfig> {
  readonly steps: readonly OnboardingStep[];

  static create<TConfig>(steps: OnboardingStep[]): OnboardingFlow<TConfig>;
}

// Onboarding context passed to steps that need platform services
interface OnboardingContext {
  credentialStore: CredentialStore;
}

type OnboardingStep =
  | InputStep
  | ValidationStep
  | SelectStep
  | OAuth2Step
  | CustomStep;

interface InputStep {
  kind: "input";
  label: string;
  description?: string;
  fields?: Record<string, FieldDescriptor>;
  // Typed credential keys — platform writes these to the credential store.
  // They do not appear in the accumulated config.
  credentials?: Record<string, AnyCredential<unknown>>;
}

interface FieldDescriptor {
  type: "string" | "number" | "boolean";
  required?: boolean;
  default?: unknown;
  placeholder?: string;
}

interface ValidationStep {
  kind: "validation";
  label: string;
  validate(accumulated: Record<string, unknown>, ctx: OnboardingContext): Promise<void>;
}

interface SelectStep {
  kind: "select";
  label: string;
  field: string;
  options(accumulated: Record<string, unknown>, ctx: OnboardingContext): Promise<SelectOption[]>;
  multiple?: boolean;
  // Note: for large option sets (e.g. Slack channels), a SearchStep variant
  // with typeahead/filtering will be needed. Not designed yet.
}

interface SelectOption {
  label: string;
  value: string;
}

interface OAuth2Step {
  kind: "oauth2";
  label: string;
  provider: string;
  scopes: string[];
  credential: CredentialKey<string>;  // where to store the refresh token
  // Platform handles redirect mechanics.
  // Tokens are written directly to the credential store via the typed key.
}

interface CustomStep {
  kind: "custom";
  label: string;
  execute(accumulated: Record<string, unknown>, ctx: OnboardingContext): Promise<Record<string, unknown>>;
}
```

---

## Where Things Live

| Concern | Package | Rationale |
|---------|---------|-----------|
| EntityDef, Ref, Scope, Batch, Page, Brand, Fields | `@max/core` | Low-level primitives and cross-functional utilities |
| ConnectorSchema, ConnectorDef, ConnectorModule, Installation | `@max/connector` | Connector framework — depends on core |
| ConnectorRegistry, CredentialStore, Credential | `@max/connector` | Connector infrastructure — interface and basic implementation |
| OnboardingFlow, step types, step utilities | `@max/connector/onboarding` | Subpath export — onboarding is a connector concern |
| OAuth2Step helpers, common auth patterns | `@max/connector/onboarding` | Library utilities connectors compose into their flows |
| Individual connectors | `@max/connector-{name}` | Each connector is its own package |

---

## Open Questions

1. **Error boundary** — Connectors define their own MaxError boundaries. The question is whether the boundary should be declared on ConnectorDef so the platform can associate errors with connectors. An alternative: the platform provides a boundary that gets injected into the connector, but this complicates compile-time error definitions. Needs more thought.

2. **Webhook interface** — Deferred. The contract for routing webhooks to connectors (payload shape, handler registration, URL allocation) will be designed when we implement webhook support. The routing story depends on Max's advertised URL and federation model.

3. **Context injection** — Loaders declare `context: MyContext`. The platform needs to supply the correct context when running loaders. Since `initialise` creates the context and the def carries the resolvers/seeder, the platform can pair them. The exact wiring (how the executor receives the context for a given installation) needs to be specified when we implement the sync integration.

---

## Roadmap

Items identified during design that need future work:

- **Credential store NFRs** — Encryption at rest, access audit logging, rotation policies, revocation, multi-backend support. Initial implementation is a basic local key-value store
- **Scope-to-operation mapping** — Map required scopes to specific loader operations. Detect insufficient permissions at runtime. Validate scopes during onboarding. For now, scopes are declared on the def for visibility and version diffing
- **SearchStep** — Typeahead/search variant of SelectStep for large option sets (e.g. Slack channels)
- **Capabilities declaration** — Declarative way for connectors to advertise what they support (webhooks, incremental sync, health checks). For now, optional methods on Installation are sufficient
- **Config migration** — When a connector upgrades and its config shape changes, how do stored configs migrate? Connector version number is established; migration framework is not
- **Remote connector registry** — Downloading and loading connectors from an external registry
- **Partial/targeted sync** — Platform-level API for syncing specific entities or fields rather than a full seeder-driven sync
- **Federation discovery** — How federated Max instances share knowledge of available connectors
