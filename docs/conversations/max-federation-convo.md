### User


Hey Claude, could you create me an executive overview document that details how every aspect of Max works and fits together? The intended target audience is an agent with whom I wish to have architectural discussions. They need to be equipped with knowledge of what all of the components of the system are and roughly how the system stitches together. They won't need super detailed, granular information, right down to heavy code examples, etc. They will need the information to be delivered in a very terse and tightly structured format.  
I imagine this is probably sections with nested bullet points where each line is a very semantically rich but terse representation of a single area or concept, with more detail added if needed in sub-lines. This document cannot be overwhelmingly long; otherwise the agent won't be able to fit it into context.  
The topics that I want to discuss with the agent (just to help you understand what we're gunning at here) are:
- the architectural structuring of the project in the system
- the module boundaries
- the execution model
- how connectors work and how they're resolved
- the intention to have swappable modules for things like storage and execution. If you're not sure about the framing in terms of terseness or layout, you can give me a small sample and I'll feed back on it. 


### Assistant



I'll start by exploring the codebase thoroughly to understand all the components before writing anything.Now let me check a few more specifics before writing the document.Now I have a complete picture. Let me write the document.Done. I've created `docs/ARCHITECTURE.md` — a terse, tightly structured executive overview covering:

- **Package layers** with dependency order
- **Core type system** primitives
- **Connector model** (authoring surface, resolution, onboarding, credentials)
- **Sync pipeline** (the full seeder → plan → task graph → drain loop flow)
- **Execution model** (Rust shim, direct vs daemon mode, runtime caching)
- **Storage & Engine** (interface, SQLite impl, sync metadata)
- **Swappable module boundaries** (table showing every interface, current impl, and what it could be swapped for)
- **On-disk project structure**
- **Error system**

It's structured as section headers with nested bullets, each line carrying a single concept. Want to review it and feed back on the density/framing before I adjust?

### User

Excellent, thank you.  
One of the topics i'd like to talk about with an audience is a design tension around daemon/project/installation management. What I'm sensing is that we need more levels of "daemon" than i have envisaged. Right now, there's:  
cmd -> *[project daemon]  
and the project daemon now manages installation "runtimes"
  
That project manager feels like it's doing a similar job to max itself - managing a fleet of long-running installations. But it seems to me that actually, each installation really wants to be its own spawned, running process. Which creates what feels like a recursive tiering, where basically max wants to talk to max... but at different levels (a max that's "installation scoped" has exactly 1 installation, etc)
  
I'd really like to have that design tension discussion with you. Do you understand my concern? Max is intended to be pretty federated - i see scenarios where I have multiple levels of max in different hosting conditions. Right now, I'm entirely local - and that's fine - but i don't want to paint myself into a corner. In particular, I'm uncomfortable with the fact that one single daemon may be running multiple installation runtimes - it shouldn't really have to do so much
"work" (restarting, monitoring etc)

### Assistant

Yes, I think I see it clearly. Let me play it back.

The tension is that you have three logical **scope levels** — global, project, installation — but only two **process tiers** (CLI → project daemon). The project daemon is doing double duty: it's both the project-level coordinator *and* the in-process host for every installation runtime. That's two jobs that happen to be collapsed into one process today.

The uncomfortable part: MaxProjectApp with its `Map<InstallationId, InstallationRuntime>` is essentially a hand-rolled process supervisor — it creates runtimes, caches them, tears them down — but without any of the properties you'd want from a supervisor (isolation, independent restart, independent failure). One bad loader crashes everything.

And then the recursive shape emerges: if an installation runtime were its own process, the project daemon becomes a supervisor that talks to installation daemons. But an installation daemon is just... Max, scoped to exactly one installation. Same lifecycle, same socket pattern, same request/response model. And if you zoom out, the global `~/.max/daemons/` discovery is already a proto-supervisor of project daemons.

So the pattern at every level is: **a Max that knows about N things below it, and can talk to them**. The only difference is the scope of what "below" means.

A few questions to sharpen where the tension bites hardest for you:

1. **Is the concern primarily about fault isolation** (one installation shouldn't take down siblings), or is it more about the **deployment topology** (an installation runtime should be deployable independently — maybe not even on the same machine)?

2. **The interface surface between levels** — right now MaxProjectApp calls `InstallationRuntimeImpl.create()` directly and gets back an in-process object. If installation runtimes were separate processes, that becomes an IPC boundary. Are you thinking this should be the *same* InstallationRuntime interface, just with a proxy implementation that talks over a socket? (i.e., the consumer doesn't know or care whether the runtime is local or remote)

3. **How deep does the recursion go in practice?** I can see global → project → installation as three levels. Do you foresee a fourth (e.g., an installation that internally federates across multiple API regions or accounts)?

### User

Yes - that framing is spot on. Max of N pretty much covers most of the territory. I have a feeling that as we descend the levels, we are implicitly supplying contextual information like (in order):
- PROJECT=
- INSTALLATION=  
(i wonder if "project" is a bad naming now)

1. Regarding your questions - my primary concern is deployment topology (I see max's being seamlessly hostable on metal, in-process, docker, server etc). I don't care how they're presented. But this of course provides a benefit i care a lot about, which is blast-radius limitation (fault and resource isolation)

2. Yes - i think the interface hides the detail. Creating a runtime (getting it from some runtime provider) means that the creator doesn't necessarily know anything about the underlying deployment. This means that "InstallationRuntimeImpl" is definitely only fit as a stand-in for now. 

3. Good question. I _think_ we're likely to only have 3 levels - but i can see a potential for a fourth - say in the scenario where a _large_ installation wants to naturally segment itself. E.g. perhaps google workspace is better represented as multiple installations by OrgUnit with one orchestrator. I'm willing to discuss this - I don't believe we need infinite levels - but i also wonder if perhaps we ought to set a hard limit on the exact levels that are supported  


### Assistant

This is crystallizing nicely. Let me push on a few threads.

**On naming**: I think your instinct is right that "project" is load-bearing in the wrong way. "Project" implies a user's working directory — a filesystem concept. But what level 1 actually *is* is a **scope that groups installations and provides shared context to them**. If that scope can live on a remote server, "project" doesn't fit anymore. It's closer to a "namespace" or "workspace" — though both of those are overloaded terms.

**On context accumulation**: The pattern you're describing is essentially progressive context binding as you descend:

```
Global Max          → {}
  Namespace Max     → { namespace: "my-team" }
    Installation Max → { namespace: "my-team", installation: "acme-prod" }
```

Each level binds one piece of context and then supervises N children that inherit it. This is clean — but it raises a question: is the context binding the *defining characteristic* of a level, or is it the *capability surface* that changes? Because right now:

- Level 1 (namespace/project) can: list installations, run onboarding, manage credentials, spawn runtimes
- Level 2 (installation) can: sync, query, load entities

These are genuinely different capability surfaces, not just the same thing with more context. A namespace-scoped Max doesn't know what an EntityDef is. An installation-scoped Max doesn't know what onboarding is.

**On the hard limit**: I'd argue for **exactly 3 well-known levels**, with level 2 (installation) being the leaf that *cannot* subdivide. Here's my reasoning:

The Google Workspace segmentation example is real, but I think it's better modeled as **one namespace containing N installations** (one per OrgUnit) rather than as one installation subdividing. The subdivision framing implies the installation is a composite — which means the installation interface now needs to expose orchestration *and* data operations. Keeping the installation as the atomic unit of "one connector, one schema, one DB, one sync" is a much cleaner invariant.

If someone wants to orchestrate across OrgUnits, that's a namespace-level concern: "I have 5 Google Workspace installations, one per OrgUnit, and I want to manage them as a group." That's just the namespace Max doing its normal job.

The alternative — allowing a 4th level — buys you flexibility but at a real cost: every interface that touches "a running Max" now needs to handle an unknown depth. Error propagation, health aggregation, context resolution all become tree-walking problems instead of known-depth lookups.

**The question this raises**: If 3 levels is the answer, does the **transport/placement abstraction** need to exist at every boundary, or only at specific ones? Right now the interesting boundaries are:

- CLI → Namespace (currently: Rust shim → project daemon over Unix socket)
- Namespace → Installation (currently: in-process method call)

Both of these could be remote. But do they need the *same* abstraction for remoteness, or are they different enough to warrant distinct proxy interfaces?

### User

On that last question - I'm not sure - it depends on what exactly you / we mean by abstraction for remoteness. I think that the interface (in terms of actual semantic callables like listInstallations() or listNamespaces()) are obviously different - but the communication and lifecycle abstraction _could_ remain the same - in the sense of starting, stopping, health-checking, communicating (message passing?) to and fro. 
  
I agree with your intuition that there _are_ different capabilities at each layer. What i'm not sure is whether we smooth those away - e.g. 
- at global layer: `max project list` would give us n projects
- at installation layer `max project list` would give us 1 projects (list)
  
Some options:
- each layer has a "friendlified" interface but fundamentally works the same way (risk: leaky abstraction)
- each layer re-uses core tooling but has its own distinct interface. Boundaries need to be handled explicitly
  
On naming:
- I think we should go with Global, Workspace, Installation
- Global = basically the cli outside the context of any workspace. Used to init workspaces or list what the machine/application knows
- Workspace = a max "project". Has multiple installations, and has the theoretical capability of cross-correlating information from them - e.g. identifying the same user in different installations as being the same identity
- Installation = a connected max connector (an installation). Represents 1 saas/tool account.
  
What are your thoughts? And how would you approach the proxy/abstraction boundaries?
  
One thing to note:
- You said "A namespace-scoped Max doesn't know what an EntityDef is. An installation-scoped Max doesn't know what onboarding is."  
I'm not _sure_ both or either of those are true. I'm sure i could re-onboard an installation in an installation-scoped max (no?). And i think it's reasonable to say I can `search` across a workspace (e.g. give me all files that are larger than 5mb) i don't care which installation. I would say that every Max knows what an EntityDef is - it's simply the `Scope` (EntityResult<Type,Scope>) that changes. A workspace-level max will have Entities that have Workspace-level scopes   
^ ah - i realise you were referring to EntityDef (which simply describes field definitions) not entities themselves - but i think the same argument applies. Also - sidenote - i can see that our current type-system doesn't carry scope information through the entity result but it will do. E.g. any entity that goes from installation boundary to project/workspace boundary will get hydrated with its installationId etc.

### Assistant

You're right to push back on my capability stratification — I was wrong. Let me reframe.

**The correction**: capabilities aren't stratified by level. They're the *same* capabilities at **widening scope**. Every level knows what entities are, can query, can sync. What changes is:

1. The **scope** entities carry (LocalScope at installation, WorkspaceScope at workspace, etc.)
2. Whether you **manage sub-units** at this level (a workspace manages installations; an installation doesn't)

So a workspace-level `max search "files > 5mb"` fans out to N installations, gets results back, scope-upgrades them (hydrates installationId), and returns a unified result set. The operation is the same. The scope is wider. This maps directly to your existing Scope system — it was designed for exactly this boundary crossing.

**On the proxy/boundary approach**: I think what you're describing naturally separates into two layers:

**1. Uniform operational wrapper** (same at every level):
- Lifecycle: start, stop, health
- Discovery: what children does this node have?
- Transport: request/response message passing (Unix socket, HTTP, in-process call — doesn't matter)

This is the "Max node" concept. Every Max at every level looks the same from the *operational* perspective. You can start it, stop it, check on it, send it messages. The thing that starts, manages, and talks to a Max node doesn't need to know what level it is or where it's deployed. This is your shared abstraction.

**2. Level-specific protocol** (what messages mean):
- Global: workspace CRUD, global config
- Workspace: installation CRUD, cross-installation queries (scope-upgraded results), identity correlation, onboarding
- Installation: sync, query, schema, re-onboard, credential management

These are different message *vocabularies* delivered over the same transport. A workspace Max sends "sync" to an installation child. A global Max sends "list installations" to a workspace child. The *transport doesn't care* — it's just carrying typed messages. The *types* encode what's legal at each level.

**Scope transformation is the boundary's job**: When data crosses from child to parent, scope upgrade happens at the boundary — not inside either node. This means the proxy between workspace and installation isn't a transparent pass-through. It's a **scope-upgrading boundary** that:
- Forwards requests downward (no transformation needed — you're narrowing scope)
- Transforms responses upward (scope upgrade — hydrate installationId, etc.)

This is the key insight: **the proxy IS the scope boundary**. Your existing ScopeUpgradeable mechanism is exactly what runs at this layer.

**On the two options you raised** (friendlified uniform interface vs distinct interfaces with shared tooling): I'd lean toward **option 2** but framed differently. Not "distinct interfaces" in the sense of totally separate code — but rather:

- One `MaxNode` operational interface (lifecycle, health, transport) — generic, level-agnostic
- Level-specific protocol types that define what messages that node accepts
- Scope-upgrading boundary proxies that sit between levels

The risk with option 1 (same interface everywhere, "friendlified") is exactly what you flagged: you'd be implementing `listInstallations()` on an installation-scoped Max just to return `[self]`, which is a lie. The installation doesn't manage installations — it *is* one. Pretending otherwise is a leaky abstraction.

**A question this raises for you**: The scope-upgrading boundary proxy — does that live in the parent (workspace owns the proxy that talks to its installations), in the child (installation exposes a scope-upgradeable surface), or as a standalone intermediary? This choice affects where deployment topology decisions get made. If the parent owns the proxy, the parent decides *how* to reach the child. If it's standalone, you could inject different proxies for different deployment topologies without touching either node.

### User

This makes sense. I think scope upgrading has to come from the parent - because i don't think the child can possibly know enough information to upgrade itself. Imagine i have two max's - one on my laptop, one on my computer. They both connect to a gdrive. From their perspective, they have no globally unique installation id.  
It's only at the point of binding them into a workspace that i could give each one an installation id. I think that when the Workspace max pulls data out of an installation, it supplies the installation id. Same with workspace - it gets an id given to it by the global level.
  
Do you think this causes any issues?   
I don't think the parent decides _how_ to reach the child, so much as the parent has been configured to reach the child. I would think of it like this:

- If the parent _created_ the child, it already knows how to reach it
- If the parent was _pointed_ at the child (e.g. "Here, add an installation at location http://localhost:1882") it knows how to reach the child
  
Ultimately, the parent has to know in the first place, otherwise it can't even communicate with the child
  
I think:
- an installation level pretty much knows only how to access its saas upstream
- a project (workspace) knows what children its managing. it starts/stops them as best it can. E.g. in the case of a remote installation - the parent is not going to be able to reliably start it, but at least it can report the child as unhealthy
- a global level manages its workspaces. it knows which workspaces have been registered
  
One other thought that springs to mind - would we benefit from a basic tooling abstraction, like a `Supervisor<R extends Supervised>`? Something that abstracts away listing and lifecycle management? Or do you think that's literally a MaxNode 1-1?

### Assistant

Your framing of scope assignment flowing downward is exactly right, and it has a really clean property: **children are portable**. An installation doesn't know it's "installation-7" — it just produces LocalScope entities. The workspace stamps the installationId when pulling data up. This means the same physical installation process could theoretically be bound into two different workspaces with different IDs. Identity is the parent's concern, not the child's.

On the lifecycle asymmetry — yes, this is the honest model. A workspace doesn't "own" a remote installation's process in the way it owns a local one. It can:
- **Local child it created**: start, stop, restart, health-check (full control)
- **Remote child it was pointed at**: health-check, report unhealthy, maybe send a shutdown request (best-effort)

The parent's relationship to each child is: "I know how to reach you, and I do my best to manage you, but I don't pretend I can always control you."

**On `Supervisor<R extends Supervised>`**: I think this is genuinely useful and *not* 1:1 with MaxNode. Here's why:

MaxNode has three concerns:
1. **Supervision** — managing a fleet of children (lifecycle, health, discovery)
2. **Protocol** — level-specific message handling (what this node *does*)
3. **Scope boundary** — upgrading data as it crosses from child to parent

A Supervisor handles concern 1 only. And crucially, **Installation is not a supervisor** — it's a leaf. So the hierarchy is:

- **Global** = Supervisor\<Workspace\> + global protocol + scope boundary
- **Workspace** = Supervisor\<Installation\> + workspace protocol + scope boundary
- **Installation** = installation protocol only (leaf node, no children)

This means Supervisor is the shared infrastructure between Global and Workspace but doesn't pollute Installation. That's the right boundary — you don't want Installation implementing `children()` just to return `[]`.

What Supervisor\<R\> gives you:

- `register(handle)` / `unregister(id)` — bind/unbind a child (regardless of how it was discovered)
- `get(id)` / `list()` — child resolution
- `health()` — aggregated health across children (delegates to each child's health check)
- Best-effort lifecycle delegation: `start(id)`, `stop(id)` — which might no-op or fail gracefully for remote children

And `R extends Supervised` (or whatever the bound is called) defines what a child must look like from the parent's perspective:

- `health(): HealthStatus`
- `send(message): response` (transport-agnostic)
- Maybe `lifecycle?: { start(), stop() }` — optional, because a remote child you were pointed at might not support managed lifecycle

**One question this raises**: the `register` step — when a workspace registers a child, it needs to produce the child handle (the `R`). For a locally-created child, register = create process + return in-process or socket handle. For a remote child, register = store the URL + return HTTP handle. This creation logic is outside Supervisor — Supervisor just manages handles it's given. Does the **factory** for child handles feel like it belongs at the Supervisor level, or is it a separate concern (a "placement strategy" or "child provider")?

That might be overthinking it for now. But it matters because it's the seam where "in-process vs. Docker vs. remote" gets decided.

### User

I think you're right, there _has_ to be a child provider. It _could_ be that the child provider implements the Supervisor interface too. Example:
- Consider a workspace with 2 installations - one is fs, one is remote
- On startup, the ProjectManager (whatever that is) looks at its configuration and sees 1 fs connection, 1 remote connection. The "ProjectManager" (let's say this is a super-combinator of all available sub connection strategies) spins up a child via an FS provider and monitors its handle. Similarly, it spins up a connection to the remote via a RemoteProvider and monitors its connection.
- When we ask to createa new connection, we supply the target of "fs" and the project manager uses the FSProvider to route the call.
  
Does that track for you? Any ghouths/concerns? And have we covered all bases?
  
What I think we need next is a clear hierarchical ontology. What are the terms, what are the interfaces, how are they grouped.

### Assistant

That tracks. The composite-provider model is clean: the workspace-level manager doesn't need to know *how* children are hosted — it delegates to providers that do. The provider is both factory and type-specific supervisor (FsProvider checks PIDs, RemoteProvider does HTTP health pings, etc.). The workspace aggregates across providers for a unified view.

One small concern: **provider routing for new connections**. You said "we supply the target of 'fs' and the project manager uses the FSProvider." This means the workspace manager needs a registry of `target-type → provider`. That's straightforward, but it means the set of deployment targets is an extension point — you'd want to be able to add a DockerProvider later without modifying the workspace manager. As long as providers are pluggable (registered, not hardcoded), this is fine.

I think we've covered the structural territory. Let me lay out the ontology.

---

## Ontology

### Levels (exactly 3, not recursive)

| Level | Role | Manages | Assigns to children |
|---|---|---|---|
| **Global** | Entry point. Knows all workspaces on this host/app | Workspaces | WorkspaceId |
| **Workspace** | Groups installations. Cross-installation queries, identity correlation | Installations | InstallationId |
| **Installation** | Leaf. One connector, one schema, one data store. Produces LocalScope entities | Nothing (leaf) | — |

### Scope flow

```
Global (GlobalScope)
  │ assigns WorkspaceId ↓         data flows ↑ stamped with WorkspaceId
  Workspace (WorkspaceScope)
    │ assigns InstallationId ↓    data flows ↑ stamped with InstallationId
    Installation (LocalScope)
```

- Identity flows **down** (parent assigns)
- Data flows **up** (child produces, parent scope-upgrades)
- Child never knows its own parent-assigned identity

### Infrastructure abstractions (level-agnostic)

**Supervised** — the contract a child exposes to its parent:
- `health(): HealthStatus`
- `lifecycle?: { start(), stop() }` — optional; remote children may not support managed lifecycle

**ChildHandle\<R\>** — a parent's view of one managed child:
- `id` — parent-assigned identity (InstallationId, WorkspaceId)
- `supervised: Supervised` — health + lifecycle
- `transport: Transport` — message passing to this child
- Opaque to the parent — encapsulates deployment details

**Transport** — uniform message passing, implementation-agnostic:
- `send(message): Promise<response>`
- Implementations: InProcessTransport, UnixSocketTransport, HttpTransport, ...

**ChildProvider\<R\>** — factory + type-specific supervisor for one deployment strategy:
- `create(config): ChildHandle<R>` — spawn a new child
- `connect(location): ChildHandle<R>` — bind to an existing child
- `list(): ChildHandle<R>[]` — children this provider manages
- Encapsulates deployment-specific supervision (PID checks, HTTP pings, etc.)
- Pluggable — register new providers without modifying parent

**Supervisor\<R extends Supervised\>** — aggregates across ChildProviders:
- `register(handle)` / `unregister(id)`
- `get(id)` / `list()` — unified view across all providers
- `health()` — aggregated across children
- Does **not** know about deployment details — works purely with ChildHandles

**ScopeBoundary** — transforms data crossing a level boundary:
- Stamps parent-assigned identity onto child-produced data
- `EntityResult<E, LocalScope>` → `EntityResult<E, WorkspaceScope>` (adds installationId)
- `EntityResult<E, WorkspaceScope>` → `EntityResult<E, GlobalScope>` (adds workspaceId)
- Lives at the parent side of the boundary

### Level-specific protocols

**GlobalProtocol:**
- Workspace CRUD: create, list, remove, get
- Composes: Supervisor\<WorkspaceHandle\>
- Global config, workspace discovery

**WorkspaceProtocol:**
- Installation CRUD: create (via provider), list, remove, get
- `onboard(connector, providerTarget)` — create new installation via appropriate provider
- `query(entityDef)` — fan out to installations, aggregate, scope-upgrade
- `sync(installationId)` — delegate to specific installation
- Composes: Supervisor\<InstallationHandle\>

**InstallationProtocol:**
- `sync()` — run sync pipeline
- `query(entityDef)` — local query, LocalScope results
- `schema()` — introspect connector schema
- `onboard()` / `reconfigure()` — credential and config management
- No Supervisor (leaf node)

### Composition

```
GlobalMax
  = Supervisor<WorkspaceHandle>
  + GlobalProtocol
  + ScopeBoundary (Workspace → Global)

WorkspaceMax
  = Supervisor<InstallationHandle>
  + WorkspaceProtocol
  + ScopeBoundary (Installation → Workspace)
  + ChildProviders: [FsProvider, RemoteProvider, DockerProvider, ...]

InstallationMax
  = InstallationProtocol
  + Engine + SyncExecutor + ConnectorContext
  (leaf — no supervisor, no scope boundary)
```

---

Does this capture the full picture? Two things I'm not sure we've nailed:

1. **Where does the workspace-level Engine live?** If a workspace can `query(AcmeUser)` across installations, it needs an Engine (or Engine-like thing) that aggregates. Is this a real Engine implementation that merges result sets, or is it a thinner query-fan-out layer that doesn't store data itself?

2. **The current codebase mapping**: today's MaxProjectApp is roughly a proto-WorkspaceMax with an inlined FsProvider. InstallationRuntimeImpl is a proto-InstallationMax. There's no GlobalMax at all — the CLI plays that role implicitly. Does it feel right to evolve from those anchor points, or would you rather design clean and migrate?

### User

I think that captures everything that matters at the moment.   
A few minor nits (just to avoid any confusion) 
 1. query(entityDef) is badly framed, it's going to be query(filter). (The entitydef defines an entity's schema - you want a filter / searchstring).
 2. there's an indescrepancy in the workspace/installation protocol examples. I see `sync(installationId)` and `sync()` - these both make sense - but i see that schema, for example, is omitted. However - i would argue that _all_ protocol methods from installation should be exposed upwards to the workspace. That is, if i'm communicating with the workspace, I should be able to access any behaviour of the installation. So one of three things needs to happen:  
 a) We flip the model to `.get(installation).{sync,schema,search}()` etc,   
 b) We route from .operationX(installation,...arg) to installation.operationX(arg) explicitly / generatively  
 c) or you make a case that some methods should _not_ be exposed, and we discuss what that decision rubric looks like
  
Regarding your questions:
1. I think this is an engine implementation. In my original design, engine was scoped, meaning you had an Engine<TScope>. That means that an Engine<Workspace> knows how to take references of type Workspace and fan-out/route to Engine<Installation> instances. This works fairly well - and can be replaced by a heavier weight Engine<Workspace> that handles caching etc _if needed_ transparently down the line. It is absolutely a real "Engine" - but engine is just an interface ;)

2. You're right - today's code structure is not aligned with what we're now designing. I don't care about evolution - i want to design clean and migrate. Figuring out what migration looks like is a separate concern (but i'm not worried)  


### Assistant

Good corrections. On the protocol surface question — I'd advocate strongly for **(a)**: `get(installationId).{sync, schema, search, ...}()`.

Reasoning:

- **(b)** is a maintenance trap. Every installation method needs a corresponding workspace wrapper with an installationId parameter threaded through. Add a method to installation, now you have to update workspace too. It's duplication disguised as delegation.
- **(c)** is hard to justify. I can't think of an installation operation that a workspace should actively *prevent*. The workspace is a superset — it can do everything an installation can, plus cross-installation operations.
- **(a)** is the natural model. The workspace knows about installations. Give me a handle to one, let me talk to it. The workspace's *own* surface stays focused on workspace-level concerns: installation CRUD, cross-installation search, identity correlation. No duplication.

**The handle IS the scope boundary**: when you call `workspace.get(installationId)`, what you get back isn't the raw installation. It's a **scope-upgrading proxy** — same interface as the installation protocol, but every result comes back stamped with the installationId at WorkspaceScope. The workspace constructs this proxy by wrapping the raw ChildHandle with the identity it assigned. The caller never sees LocalScope entities.

```
workspace.get("acme-prod").search("files > 5mb")
  → proxy forwards search to installation
  → installation returns EntityResult<File, LocalScope>[]
  → proxy stamps installationId → EntityResult<File, WorkspaceScope>[]
  → caller receives workspace-scoped results
```

And for workspace-level cross-cutting operations:
```
workspace.search("files > 5mb")
  → fans out to all installations via their proxied handles
  → each returns EntityResult<File, WorkspaceScope>[] (already upgraded)
  → workspace merges result sets
```

This means `workspace.search(filter)` is literally just `flatMap(installation => installation.search(filter))` over its children — because each handle already scope-upgrades. The workspace doesn't need special aggregation logic beyond merging.

**On Engine\<TScope\>**: this confirms the picture. The scoped proxy handle could literally expose `engine: Engine<WorkspaceScope>` where the implementation is a fan-out-and-upgrade wrapper around the installation's `Engine<LocalScope>`. Same interface, different scope parameter, routing handled internally. And as you say — a future heavier-weight implementation (caching, materialized views across installations) swaps in transparently behind the same interface.

**Refined protocol surfaces with option (a):**

**WorkspaceProtocol (own surface):**
- `installations: Supervisor<InstallationHandle>` — CRUD + lifecycle
- `search(filter)` — cross-installation fan-out, merged results at WorkspaceScope
- `get(installationId): ScopedInstallationHandle` — scope-upgrading proxy
- Identity correlation (future)

**ScopedInstallationHandle (proxy, returned by get):**
- Full InstallationProtocol — `sync()`, `schema()`, `search(filter)`, `onboard()`, etc.
- All results at WorkspaceScope (scope upgrade is transparent)
- Caller doesn't know if installation is local, remote, Docker, etc.

**InstallationProtocol (raw, inside the boundary):**
- `sync()`, `schema()`, `search(filter)`, `onboard()`, `reconfigure()`
- `engine: Engine<LocalScope>`
- All results at LocalScope

---

Shall I write this up as a clean spec document? We've arrived at a fairly complete picture: 3 fixed levels, named terminology (Global/Workspace/Installation), Supervisor + ChildProvider infrastructure, scope-upgrading proxy handles, Engine\<TScope\>, option (a) for protocol access. Feels like it's ready to be captured as a durable artifact.

### User

Please. I'd like to capture this very comprehensively. I'd advocate for covering the key concepts to the same level of detail as you already have above, and use later sections of the document to add more detail where necessary. If you need more than 1 document, create a folder

### Assistant



Written to `specs/SPEC-federated-architecture.md`. Nine sections covering:

1. **Levels** — Global/Workspace/Installation with definitions and the "why not four" rationale
2. **Scope System** — flow direction, upgrade mechanism, child portability
3. **Infrastructure Abstractions** — Supervised, Transport, ChildHandle, ChildProvider, Supervisor, ScopeBoundary with interface sketches and examples
4. **Protocol Surfaces** — per-level protocols, ScopedInstallationHandle proxy, option (a) rationale
5. **Engine\<TScope\>** — fan-out engine, scope-aware queries
6. **Composition Summary** — how pieces assemble at each level
7. **Lifecycle & Health** — asymmetric control table, aggregation, ordering
8. **Current Codebase Mapping** — table mapping every spec concept to what exists today
9. **Key Design Decisions** — eight numbered decisions with rationale

Have a read through — I want to make sure nothing from our discussion got lost or flattened.
