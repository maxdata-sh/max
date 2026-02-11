1. README.md - Project Overview

       Key Patterns:
       - Architecture: SyncPlan → Resolvers → Loaders → Engine → Storage
       - Type + Companion Object pattern (Interface + const with same name)
       - Core packages: @max/core, @max/daemon, @max/cli, @max/storage-sqlite

       API Surface:
       - EntityDef.create(name, fields) - Define entity schemas
       - Context - Extend to hold dependencies
       - Loader.entity() - Single ref loaders
       - Resolver.for(entity, fieldMap) - Map fields to loaders

       Conventions:
       - Import without type modifier for both type and value
       - Follow the 4-step integration pattern: Entities → Context → Loaders → Resolver

       ---
       2. Core-Concepts.md - Fundamental Types

       Key Patterns:
       - Ref: Typed references carrying entityDef, entityType, id, and scope
       - Scope: LocalScope (single install) vs SystemScope (multi-tenant with installationId)
       - EntityDef: Type + value dual pattern, defines fields with types
       - EntityInput: Complete upsert (ref + fields), returnable from loaders
       - EntityResult: Loaded entity with type-safe partial field access via .get() and .fields

       API Surface:
       AcmeUser.ref("u123")                                // LocalScope (default)
       AcmeUser.ref("u123", Scope.system("inst_456"))     // SystemScope
       localRef.upgradeScope(Scope.system("inst_456"))    // Scope upgrade
       result.get("name")  // Type-safe, only loaded fields accessible
       result.fields.name  // Proxy access

       Conventions:
       - Interface name + const name identical
       - Only loaded fields are accessible (type-safe partial loading)
       - Refs are rich objects carrying full type information at runtime

       ---
       3. Error-System.md - MaxError Composable Errors

       Key Patterns:
       - Boundaries: Domain-owned error namespaces, optionally declare contextual data
       - Facets: Reusable traits/markers for catch-site categorization
       - customProps: Error-local data via ErrFacet.props<T>() (upgrade to facet when reused)
       - Two wrap mechanisms: ErrorDef.wrap(fn) for intent, Boundary.wrap(data, fn) for domain entry
       - Cause chains: Automatic error wrapping across domain boundaries
       - Three discrimination axes: exact code, facet, or domain

       API Surface:
       // Define boundary (optionally with contextual data)
       const Linear = MaxError.boundary("linear");
       const Connector = MaxError.boundary("connector", {
         customProps: ErrFacet.props<{ connectorId: string }>(),
       });

       // Define error with customProps + facets
       const ErrIssueNotFound = Linear.define("issue_not_found", {
         customProps: ErrFacet.props<{ issueId: string }>(),
         facets: [NotFound],
         message: (d) => `Issue not found: ${d.issueId}`,
       });

       // Throw with typed data + optional context
       throw ErrIssueNotFound.create({ issueId: "ISS-123" }, "during sync");

       // ErrorDef.wrap — intent wrap: "if this fails, the error is X"
       await ErrSyncFailed.wrap(async () => { ... });

       // Boundary.wrap — domain entry with contextual data
       await Connector.wrap({ connectorId: "acme" }, async () => { ... });

       // Catch by exact type, facet, or boundary
       if (ErrIssueNotFound.is(err)) { err.data.issueId }  // typed
       if (MaxError.has(err, NotFound)) { ... }
       if (Linear.is(err)) { ... }

       // Display
       err.prettyPrint({ color: true, includeStackTrace: false })

       Standard Facets:
       - Markers: NotFound, BadInput, NotImplemented, Invariant
       - Data: HasEntityRef { entityType, entityId }, HasField { entityType, field }, HasLoaderName { loaderName }

       **Before defining new errors**, read [error-system.md](./developer/error-system.md#when-to-use-customprops-vs-data-facets). Start with customProps for error-local data; promote to a data facet when multiple errors share the same shape and catch sites need it.

       Conventions:
       - Each domain defines its own boundary in errors.ts
       - Shared boundaries (Storage, Serialization) live in their packages, wrapped internally
       - Error codes are domain-prefixed: "linear.auth_failed" not "auth_failed"
       - Same-domain errors pass through; cross-domain errors are wrapped
       - Use context parameter for detail (appended with " — " separator)
       - ErrorDef.wrap() for intent wrapping; Boundary.wrap() for domain entry

       ---
       4. Utilities.md - Core Utilities & Patterns

       Key Patterns:
       - All major types use Type + Companion Object pattern
       - Type-safe nominal branding without runtime overhead

       API Surface:
       // Batch<V, K>
       Batch.buildFrom(users).withKey(user => user.id)
       Batch.byId(items)
       batch.get("key"), batch.getOrThrow("key"), batch.values()
       batch.isFullyResolved, batch.unresolvableKeys

       // Page<T>
       Page.from(items, hasMore, cursor)
       page.hasMore, page.cursor, page.total?

       // Brands
       type UserId = Id<"user-id">       // SoftBrand - naked assignment OK
       type RefKey = HardBrand<string, "ref-key">  // Must use factory

       // Fields Selector
       Fields.select("name", "email")
       Fields.ALL

       // Keyable interface
       ref.toKey()  // "local:AcmeUser:u1"

       // Inspect
       Inspect(this, (self) => ({
         format: "TaskRunner( %s | status=%s | %O )",
         params: [self.name, self.status, self.config],
       }))

       Conventions:
       - Values in Batch should be self-contained (include their key)
       - Import both type and value: import { Ref, EntityDef } from "@max/core"
       - StaticTypeCompanion marks the pattern (transparent)
       - Format specifiers: %s (string), %O (object), %d (number)

       ---
       5. Creating-an-Integration.md - Integration Walkthrough

       Key Patterns:
       - 4-step workflow: Entities → Context → Loaders → Resolver
       - Three loader types: single (entity), batched (entityBatched), collection (collection)

       API Surface:
       // 1. Define Entities
       const AcmeUser: AcmeUser = EntityDef.create("AcmeUser", {
         name: Field.string(),
         email: Field.string(),
         isAdmin: Field.boolean(),
       });

       // 2. Define Context
       class AcmeAppContext extends Context {
         api = Context.instance<AcmeApiClient>();
         installationId = Context.string;
       }

       // 3. Create Loaders
       const BasicUserLoader = Loader.entityBatched({
         name: "acme:user:basic",
         context: AcmeAppContext,
         entity: AcmeUser,
         async load(refs, ctx, deps) {
           const users = await ctx.api.users.getBatch(refs.map(r => r.id));
           return Batch.buildFrom(
             users.map(u => EntityInput.create(AcmeUser.ref(u.id), {
               name: u.name,
               email: u.email,
             }))
           ).withKey(input => input.ref);
         },
       });

       // 4. Create Resolver
       const AcmeUserResolver = Resolver.for(AcmeUser, {
         name: BasicUserLoader.field("name"),
         email: BasicUserLoader.field("email"),
         isAdmin: BasicUserLoader.field("isAdmin"),
       });

       Loader Types:
       - Loader.entity() - Single ref → EntityInput
       - Loader.entityBatched() - Multiple refs → Batch (preferred)
       - Loader.collection() - Parent ref → Page (paginated)
       - Loader.raw() - Arbitrary data (not yet implemented in execution layer)

       File Structure Convention:
       connector-acme/
       ├── src/
       │   ├── entities.ts
       │   ├── context.ts
       │   ├── resolvers/
       │   │   ├── user-resolver.ts
       │   │   └── index.ts
       │   └── index.ts
       └── package.json

       ---
       6. Synchronisation-Layer.md - Sync Architecture

       Key Patterns:
       - Three-part architecture: Define (Resolvers+Loaders) → Plan (SyncPlan) → Execute (SyncExecutor)
       - Sequential steps with optional concurrency
       - Dynamic child task spawning for collections and pagination
       - Single-threaded drain loop

       API Surface:
       // Seeder bootstraps cold start
       const AcmeSeeder = Seeder.create({
         context: AcmeAppContext,
         async seed(ctx, engine) {
           const rootRef = AcmeRoot.ref("root");
           await engine.store(EntityInput.create(rootRef, {}));

           return SyncPlan.create([
             Step.forRoot(rootRef).loadCollection("teams"),
             Step.forAll(AcmeTeam).loadFields("name", "description"),
             Step.forAll(AcmeTeam).loadCollection("members"),
             Step.forAll(AcmeUser).loadFields("name", "email"),
           ]);
         },
       });

       // Concurrent steps
       SyncPlan.create([
         Step.forRoot(rootRef).loadCollection("teams"),
         Step.concurrent([
           Step.forAll(AcmeTeam).loadFields("name"),
           Step.forAll(AcmeProject).loadFields("status"),
         ]),
       ]);

       // SyncHandle for control
       const handle = executor.execute(plan);
       const status = await handle.status()
       await handle.pause/resume/cancel()
       const result = await handle.completion()
       // { status, tasksCompleted, tasksFailed, duration }

       Step Targets:
       - Step.forRoot(ref) - Single known root
       - Step.forOne(ref) - Single known entity
       - Step.forAll(EntityDef) - All entities of type in store

       Step Operations:
       - loadFields("a", "b") - Load named fields via resolvers
       - loadCollection("field") - Load paginated collection

       Task States:
       new → pending → running → completed
                     ↘ awaiting_children (when spawned child tasks)
                     ↘ failed (error thrown)

       Execution Model:
       - Steps run sequentially; each waits for previous step and its children
       - PlanExpander converts SyncPlan to Task Graph with dependencies
       - DefaultTaskRunner executes tasks, resolves loaders, stores results
       - Drain loop claims and processes pending tasks one at a time
       - Collection loaders spawn child tasks per entity + pagination continuation
       - When task completes, blockedBy tasks move from new to pending
       - When all siblings complete, parent completes (recursive)

       Current Limitations:
       - Loader dependencies ignored in execution (not yet implemented)
       - Raw loaders not executable (no task payload type)
       - No error recovery/resume (state supports it, trigger doesn't)
       - Loaders run inline, not as tasks (no deduplication/cross-step batching)
       - Single-threaded drain loop (no concurrent execution)

       ---
       7. Serialisation.md - Cross-Boundary Serialization

       Key Patterns:
       - Boundaries: Temporal activities, persistent storage, cross-process IPC, API responses
       - Codecs: Paired serializer/deserializer for types, live at boundaries not on types
       - Schema registry needed for type reconstruction on deserializing side

       API Surface:
       // Codec interface
       interface Codec<T> {
         serialize(value: T): unknown
         deserialize(raw: unknown): T
       }

       // Composition
       Codec.string
       Codec.number
       Codec.array(Codec.string)
       Codec.optional(Codec.number)
       Codec.page(Codec.string)
       Codec.ref(User)
       Codec.object({
         schedule: Codec.string,
         batchSize: Codec.number,
         retryPolicy: Codec.optional(RetryPolicyCodec),
       })
       Codec.page(EntityInput.codec(User))

       // Schema registry for deserialization
       interface SchemaRegistry {
         getEntityDef(entityType: EntityType): EntityDefAny
       }
       const codec = Codec.entityInput(registry)

       // Activity definition with codecs
       const fetchUsers = defineActivity({
         input: SyncSettingsCodec,
         output: Codec.page(EntityInput.codec(User)),
         fn: async (settings) => { ... }
       })

       Swappable Strategies:
       - JSON (default)
       - Temporal payload converters
       - Binary formats (MessagePack, protobuf)
       - Compressed wrappers

       Types Needing Codecs:
       - Page<T>, PageRequest, MaxPage<E, S>
       - Ref<E, S>, EntityInput<E>, EntityResult<E>
       - Batch<V, K>
       - MaxError (already via toJSON)
       - Sync task settings
       - Action descriptors
       - Workflow inputs and checkpoint state

       Conventions:
       - Status: Not yet implemented (planned for Temporal integration)
       - Keep types codec-friendly: plain data, no closures/non-serializable state
       - Schema must be available on both sides of boundary
       - Codec composition shows serialization strategy explicitly

       ---
       Cross-Document Patterns & Conventions

       Naming:
       - Error codes: "domain.code" format (auto-prefixed by boundary)
       - Loader names: "source:entity:variant" (e.g., "acme:user:basic")
       - Entity types: PascalCase with origin prefix (e.g., AcmeUser, LinearIssue)

       Type Safety:
       - Type + Companion Object pattern throughout infrastructure
       - SoftBrand for IDs (naked assignment), HardBrand for validated values
       - Scope polymorphism with default "any scope"
       - Partial loading with type-safe field access

       Error Handling:
       - Every domain gets a boundary that owns its errors
       - Facets for catch-site logic, not documentation; customProps for error-local data
       - ErrorDef.wrap(fn) for intent wrapping; Boundary.wrap(data, fn) for domain entry
       - Same-domain errors pass through; cross-domain wrapped with cause chain

       Architecture:
       - Loaders are stateless, return complete EntityInput/Batch/Page
       - Resolvers map fields to loaders; multiple fields can share a loader
       - Seeders bootstrap syncs; SyncPlan declares what to sync
       - Executor turns plans into task graphs with automatic dependency wiring
       - Storage is swappable interface (@max/storage-sqlite is default)

       Code Organization:
       - errors.ts per domain with boundary and error definitions
       - entities.ts for EntityDef definitions
       - context.ts for Context class with dependencies
       - resolvers/ folder with loader + resolver pairs
       - No toJSON/fromJSON on types; codecs live at boundaries

       This is a well-structured system with strong type safety, composable error handling, and clear separation between data definition, fetching, and storage layers.
