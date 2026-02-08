# Acme

A fake SaaS project management app for testing Maxwell sync, authentication, and real-time capabilities. Acme is completely self-contained — it knows nothing about Maxwell. A separate **Acme connector** in the Maxwell project bridges the two.

Acme models workspaces, users, projects, tasks, and files, and exposes three sync mechanisms: a forward event log, reverse-chronological task history, and webhooks.

## Quick Start

From `apps/acme/`:

```bash
bun run dev
```

This starts Acme on port 4567 with hot reloading and a tenant called "default". Open http://localhost:4567 for the dashboard — seed data, watch the changelog, and trigger mutations from there.

To use a different tenant name:

```bash
TENANT=my-tenant bun run dev
```

Tenant data persists in `tenants/<name>/` and survives restarts.

## CLI

The `./acme` convenience script wraps the CLI:

```bash
./acme start --tenant prod --port 8080   # Start server
./acme create --tenant test              # Create without starting
./acme seed --tenant test                # Seed with sample data
./acme list                              # List all tenants
```

## Library

Import `@max/acme` for programmatic access — useful for end-to-end tests:

```typescript
import { Tenant, startServer } from "@max/acme";

// In-memory tenant (no disk, no cleanup)
const tenant = Tenant.create({ name: "test", storage: "memory" });
await tenant.seed({ workspaces: 1, tasksPerProject: 50 });

// Use directly — no HTTP needed
const tasks = tenant.listTasks();
const { events } = tenant.getChanges();

// Or start a server
const { url, stop } = startServer(tenant, { port: 0 });
console.log(`Running at ${url}`);

// Subscribe to changes in-process
const unsub = tenant.onWebhook((payload) => {
  console.log(payload.entityType, payload.action);
});

// Clean up
unsub();
stop();
tenant.dispose();
```

## API

All endpoints require `Authorization: Bearer <api-key>` (except `/api/health`, `/api/meta`, and the dashboard).

| Endpoint | Description |
|----------|-------------|
| `GET /api/workspaces` | List workspaces |
| `POST /api/workspaces` | Create workspace |
| `GET /api/users?workspaceId=` | List users |
| `GET /api/projects?workspaceId=` | List projects |
| `GET /api/tasks?projectId=` | List tasks |
| `GET /api/files?projectId=` | List files |
| `GET /api/changes?since=N&limit=N` | Forward event log (cursor-based) |
| `GET /api/changes/recent?limit=N` | Latest N changes (newest first) |
| `GET /api/tasks/:id/history` | Reverse-chronological task history |
| `POST /api/webhooks` | Register webhook URL |
| `POST /api/seed` | Seed sample data |
| `GET /api/stats` | Entity counts and generation state |

All entity types support `GET /:id`, `PATCH /:id`, and `DELETE /:id`.

## Changelog Payload Rules

These asymmetries are intentional — they exercise different sync strategies:

| Action | Entity | Payload |
|--------|--------|---------|
| Create | Any | All fields |
| Update | Task | Only changed fields |
| Update | File | Empty (must re-fetch) |
| Delete | Any | Empty (just type + id) |
