# DESIGN: Installation Services

> Design notes for future spec. Captures the three-layer model for installation lifecycle.
> Date: 2026-02-22. Status: Early design, not yet specced.

---

## Problem

An installation that is "started" may or may not be doing useful work. Today, liveness and activity are conflated — an installation is either running or not. But in practice there are multiple independent concerns: is it syncing? Is it listening for webhooks? Is it serving an API? These can fail independently, be toggled independently, and have independent health.

---

## Three-Layer Model

### Layer 1: Liveness (`start` / `stop`)

Is the node process running and able to accept commands?

- Controlled by `max start` / `max stop`
- Binary: alive or stopped
- A stopped installation does nothing — no services, no health, no responses
- Prerequisite for everything else

### Layer 2: Services (`enable` / `disable`)

What active subsystems does this installation have running? Each service is independently toggleable.

Examples of services a connector might declare:

| Service | What it does | Push/Pull |
|---------|-------------|-----------|
| **sync** | Periodic or on-demand data pull from upstream | Pull |
| **webhooks** | Receives push events from the upstream tool | Push (inbound) |
| **api** | Exposes data to external consumers | Push (outbound) |
| **realtime** | Persistent connection to upstream (WebSocket, SSE, long-poll) | Push (inbound) |

Services are:
- **Declared by the connector** — the connector definition says "I support these services." You can't enable a service the connector doesn't declare.
- **Configured per-installation** — the user chooses which declared services to enable. Defaults come from the connector or from `connect`-time config.
- **Independently togglable** — enable webhooks without enabling sync, or vice versa.

An installation that is alive but has all services disabled is idle — it responds to health checks and commands but isn't actively doing work.

### Layer 3: Health (observation, not control)

Is each enabled service actually working? Health is a read-only observation, not something you toggle.

- An enabled service can be: healthy, degraded, or failing
- A disabled service has no health (it's off)
- Installation-level health is an aggregate of its service health
- Examples of unhealthy states:
  - Sync enabled but credentials expired
  - Webhook listener enabled but port conflict
  - Realtime connection enabled but upstream rejecting connections

```
stopped ──start──→ alive
                      │
                      ├── sync        enabled/disabled    healthy/degraded/failing
                      ├── webhooks    enabled/disabled    healthy/degraded/failing
                      ├── api         enabled/disabled    healthy/degraded/failing
                      └── realtime    enabled/disabled    healthy/degraded/failing
```

---

## Connector Declaration

Connectors declare which services they support. This is part of the connector definition (`ConnectorDef` or similar):

```typescript
// Rough shape — not final
interface ConnectorDef {
  // ... existing: name, schema, onboarding, etc.
  services: ServiceDeclaration[]
}

interface ServiceDeclaration {
  kind: 'sync' | 'webhooks' | 'api' | 'realtime' | string
  defaultEnabled: boolean
  // ... configuration schema for this service?
}
```

A HubSpot connector might declare:
```typescript
services: [
  { kind: 'sync', defaultEnabled: true },
  { kind: 'webhooks', defaultEnabled: false },
]
```

A read-only analytics connector might only declare sync. A real-time collaboration tool might declare realtime + webhooks but no sync.

---

## CLI Surface (Rough)

```bash
# Liveness
max start                              # bring node alive
max stop                               # take it down

# Services
max service list                       # show services + status for current installation
max service enable sync                # enable a service
max service disable webhooks           # disable a service

# Status (shows everything)
max status
# hubspot-prod (max://~/bun-test-project/hubspot-prod)
#   Status: running
#   Services:
#     sync        enabled     healthy    last run 2m ago
#     webhooks    enabled     healthy    listening on :8443
#     api         disabled    —
```

Open: whether `service` is the right grouping or whether `enable`/`disable` should be top-level. Leaning toward grouping — `enable`/`disable` as bare top-level verbs are ambiguous (enable what?).

---

## Relationship to Existing Concepts

- **Supervised interface** — `start()`, `stop()`, `health()` already exist. Services extend this with finer granularity below the node level.
- **HealthStatus** — currently a single status per node. Would need to become an aggregate that surfaces per-service health.
- **Sync** — today `sync` is a command (`max sync`). With services, sync-as-a-service is the *ongoing capability*, while `max sync` might trigger an immediate one-shot sync regardless of whether the sync service is enabled.

---

## Open Questions

1. **Service configuration.** Some services need config (webhook listener needs a port, sync needs a schedule). Where does this live? Installation spec? Runtime config?

2. **Service dependencies.** Can services depend on each other? (e.g., webhook processing might require sync infrastructure to be initialized). Or keep it flat?

3. **One-shot vs continuous.** `max sync` today is one-shot ("sync now"). Sync-as-a-service is continuous ("sync on a schedule"). Both should coexist — you can trigger a manual sync even if the sync service is disabled.

4. **Workspace-level services.** Could a workspace itself have services? (e.g., a cross-installation search index, a unified API gateway). Or is services strictly an installation concept?

5. **Service lifecycle within start/stop.** When you `max start` an installation, do enabled services start automatically? (Probably yes.) When you `max stop`, do services stop gracefully? (Definitely yes.)
