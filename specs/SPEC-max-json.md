# SPEC: max.json Project Configuration

> Authored: 2026-02-18. Companion to SPEC-federated-architecture.md.
> Status: Design complete. Implementation in progress (FsInstallationRegistry).

## Overview

`max.json` is the declarative project configuration file for a Max workspace. It plays the same role as `package.json` in a Node project — it declares **what should exist**, is version-controlled, and is shareable across team members. The `.max/` directory is the runtime workspace (like `node_modules/`) — credentials, synced data, and ephemeral state that is machine-specific and gitignored.

**Scope**: Schema definition for `max.json`, the relationship between its two sections (`connectors` and `installations`), local vs remote installations, and the `max install` lifecycle. Does not cover credential store design, `max typegen`, or the boot sequence (those are follow-ups).

### Design principles

1. **Declarative intent.** `max.json` describes what a project needs, not what currently exists. Given secrets and network access, Max can reconstruct the full workspace from this file alone.
2. **Version-controllable.** No secrets, no machine-specific paths, no ephemeral state. Safe to commit to git. A teammate cloning the repo gets the full picture of what connectors and installations the project uses.
3. **Connector code is a package.** Connectors are installable packages — from Max Hub, npm, git, or local paths. They follow package versioning semantics.
4. **Installations are instances.** One connector can have many installations. Each installation connects to a specific external service (a Linear team, a Google Drive folder, a HubSpot account).
5. **Federation-aware.** An installation can be local (Max manages the process) or remote (Max connects to an existing Max instance elsewhere). The project config captures this topology.

---

## 1. File Location and Lifecycle

`max.json` lives at the project root, alongside the `.max/` directory:

```
my-project/
  max.json                  <-- declarative config (git-tracked)
  .max/                     <-- runtime workspace (gitignored)
    installations/
      linear/default/
        credentials.json
        data.db
```

Created by `max init`. Read by the workspace boot sequence. Modified by `max connect`, `max disconnect`, and manual editing.

---

## 2. Schema

```jsonc
{
  // Optional: alias table for non-standard connector sources
  "connectors": {
    "@acme/connector-internal-crm": "git+https://github.com/acme/max-crm.git"
  },

  // Instances of connectors, connected to real services
  "installations": {
    "linear": {
      "id": "a1b2c3d4-e5f6-...",
      "connector": "@max/connector-linear@1.2.0",
      "connectedAt": "2026-02-18T12:00:00.000Z",
      "config": { "teamId": "ENG", "workspace": "acme" }
    }
  }
}
```

---

## 3. Connectors Section

The `connectors` section is an **alias table** that maps package names to non-standard sources. Max Hub packages do not need an entry — they resolve by convention (like npm's default registry).

```jsonc
{
  "connectors": {
    // Git source — custom connector from a private repo
    "@acme/connector-internal-crm": "git+https://github.com/acme/max-crm.git",

    // Local source — connector under development
    "my-custom": "file:./connectors/my-custom"
  }
}
```

Max Hub connectors (the `@max/connector-*` namespace) resolve automatically. The version is specified on the installation, not here — this section only declares **where to find** the code.

---

## 4. Installations Section

Each key is the installation name (a human-readable slug). The value describes the installation:

### 4.1 On-disk format

```typescript
interface MaxJsonInstallation {
  /** Parent-assigned UUID, stable across restarts. */
  id: InstallationId

  /** Connector package with version tag. */
  connector: ConnectorType        // e.g. "@max/connector-linear@1.2.0"

  /** When this installation was first connected. */
  connectedAt: ISODateString

  /** Deployment strategy. Defaults to "in-process" if omitted. */
  provider?: ProviderKind

  /** Provider-specific locator. Required for remote, absent for local. */
  location?: unknown

  /** Non-secret connector configuration. */
  config?: unknown
}
```

### 4.2 Local installations

The common case. Max owns the full lifecycle — downloads connector code, manages the process, stores credentials and synced data in `.max/`.

```jsonc
{
  "installations": {
    "linear": {
      "id": "a1b2c3d4-...",
      "connector": "@max/connector-linear@1.2.0",
      "connectedAt": "2026-02-18T12:00:00.000Z",
      "config": { "teamId": "ENG" }
    },
    "gdrive": {
      "id": "e5f6g7h8-...",
      "connector": "@max/connector-google-drive@2.0.0",
      "connectedAt": "2026-02-18T12:00:00.000Z",
      "provider": "subprocess",
      "config": { "driveId": "0A1B2C3D4E" }
    }
  }
}
```

When `provider` is omitted, it defaults to `"in-process"`. Explicit `"subprocess"` forces isolation (useful for memory-hungry connectors).

### 4.3 Remote installations

Max connects to an existing Max installation running elsewhere. The remote owns the connector code, credentials, and data. Max only needs a URL.

```jsonc
{
  "installations": {
    "linear-staging": {
      "id": "x9y0z1-...",
      "connector": "@max/connector-linear@1.2.0",
      "connectedAt": "2026-02-17T10:00:00.000Z",
      "provider": "remote",
      "location": { "url": "https://staging.acme.com/max/installations/linear" }
    }
  }
}
```

Note: `connector` is optional for remote installations since the schema can be discovered via RPC. Including it is informational — it documents what the remote provides without requiring a network call.

### 4.4 Multiple installations per connector

A project can have multiple installations of the same connector, and even multiple versions:

```jsonc
{
  "installations": {
    "linear-eng": {
      "id": "...",
      "connector": "@max/connector-linear@1.2.0",
      "connectedAt": "...",
      "config": { "teamId": "ENG" }
    },
    "linear-product": {
      "id": "...",
      "connector": "@max/connector-linear@1.2.0",
      "connectedAt": "...",
      "config": { "teamId": "PROD" }
    },
    "linear-legacy": {
      "id": "...",
      "connector": "@max/connector-linear@0.9.0",
      "connectedAt": "...",
      "config": { "teamId": "OLD" }
    }
  }
}
```

Version is specified per-installation (Docker tag style), not globally. This supports gradual migration — upgrade one installation at a time.

---

## 5. Relationship to .max/ Directory

| Concern | max.json | .max/ |
|---------|----------|-------|
| Purpose | Declarative intent | Runtime state |
| Git | Tracked | Ignored |
| Secrets | Never | credentials.json |
| Synced data | Never | data.db |
| Installation identity | id, connector, name | — |
| Non-secret config | config | — |
| Provider topology | provider, location | Socket paths, PIDs |

The `.max/` directory can be deleted and recreated from `max.json` (given secrets are available). This is the "delete node_modules and npm install" equivalent.

---

## 6. The `max install` Flow (Future)

When a team member clones a project and runs `max install`:

1. **Resolve connectors** — download/resolve packages from Max Hub, git, or local paths into `.max/connectors/`
2. **Create installations** — for each entry in `installations`:
   - **Local**: create `.max/installations/<connector>/<name>/` directory, check credential store
   - **Remote**: verify reachability (RPC health check)
3. **Report missing secrets** — "Installation 'linear' requires credentials. Run `max connect linear` to authenticate."
4. **Workspace ready** — all installations are registered and connectable

---

## 7. Programmatic Access (Future: `max typegen`)

Developers using Max as a TypeScript library can import connector entity definitions for type-safe queries:

```typescript
import { LinearIssue } from "@max/connector-linear"

const issues = await engine.query(
  Project.select(LinearIssue, { title: true, status: true })
)
```

This works by adding the connector as a regular npm dependency (`bun add @max/connector-linear`). Max does not manage `package.json` — the two concerns are independent.

For remote installations where the connector source isn't available locally, a future `max typegen` command will generate type stubs from the runtime schema (discovered via RPC `schema()` call), similar to `prisma generate`.

---

## 8. Credential Store (Future)

The current `FsCredentialStore` stores secrets in `.max/installations/<connector>/<name>/credentials.json`. Future work may allow `max.json` to reference alternative credential sources:

```jsonc
{
  "installations": {
    "linear": {
      "connector": "@max/connector-linear@1.2.0",
      "credentials": "env:LINEAR_API_KEY"
    }
  }
}
```

This is deferred. The reference strategy (env var, vault, file store) is config; the actual secrets are not.
