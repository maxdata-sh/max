/**
 * E2E test for the sync execution layer.
 *
 * Tests: seed → sync → verify stored data
 * Uses real SqliteEngine, InMemoryTaskStore, InMemorySyncMeta.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Context, Fields, NoOpFlowController } from "@max/core";
import { SqliteEngine, SqliteSchema } from "@max/storage-sqlite";
import {
  AcmeRoot,
  AcmeUser,
  AcmeTeam,
  AcmeAppContext,
  AcmeRootResolver,
  AcmeUserResolver,
  AcmeTeamResolver,
  AcmeSeeder,
} from "@max/connector-acme";
import { SyncExecutor } from "@max/execution";
import { InMemoryTaskStore } from "../in-memory-task-store.js";
import { InMemorySyncMeta } from "../in-memory-sync-meta.js";
import { LocalSyncQueryEngine } from "../local-sync-query-engine.js";
import { DefaultTaskRunner } from "../default-task-runner.js";
import { ExecutionRegistryImpl } from "../execution-registry-impl.js";
import type { AcmeApiClient } from "@max/connector-acme";

// ============================================================================
// Mock API
// ============================================================================

function createMockApi(): AcmeApiClient {
  const users: Record<string, { id: string; name: string; email: string; age: number }> = {
    u1: { id: "u1", name: "Alice", email: "alice@acme.com", age: 30 },
    u2: { id: "u2", name: "Bob", email: "bob@acme.com", age: 25 },
    u3: { id: "u3", name: "Charlie", email: "charlie@acme.com", age: 35 },
  };

  const teamMembers: Record<string, string[]> = {
    "team-root": ["u1", "u2", "u3"],
  };

  return {
    root: {
      async listTeams(opts: { cursor?: string; limit?: number }) {
        return { teams: [{ id: "team-root" }], hasMore: false };
      },
    },
    users: {
      async get(id: string) {
        const user = users[id];
        if (!user) throw new Error(`User not found: ${id}`);
        return user;
      },
      async getBatch(ids: string[]) {
        return ids.map((id) => {
          const user = users[id];
          if (!user) throw new Error(`User not found: ${id}`);
          return user;
        });
      },
    },
    teams: {
      async get(id: string) {
        return { id, name: "Root Team", description: "The root team", ownerId: "u1" };
      },
      async listMembers(teamId: string, opts: { cursor?: string; limit?: number }) {
        const members = teamMembers[teamId] ?? [];
        const start = opts.cursor ? parseInt(opts.cursor, 10) : 0;
        const limit = opts.limit ?? 100;
        const slice = members.slice(start, start + limit);
        const hasMore = start + limit < members.length;
        const nextCursor = hasMore ? String(start + limit) : undefined;

        return {
          members: slice.map((userId) => ({ userId })),
          hasMore,
          nextCursor,
        };
      },
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createContextProvider(api: AcmeApiClient) {
  return async () =>
    Context.build(AcmeAppContext, {
      api,
      installationId: "test-install",
    });
}

async function seedAndExecute(executor: SyncExecutor, api: AcmeApiClient, engine: SqliteEngine) {
  const ctx = await createContextProvider(api)();
  const plan = await AcmeSeeder.seed(ctx as any, engine);
  return executor.execute(plan);
}

// ============================================================================
// Tests
// ============================================================================

describe("SyncExecutor E2E", () => {
  let db: Database;
  let engine: SqliteEngine;
  let syncMeta: InMemorySyncMeta;
  let taskStore: InMemoryTaskStore;
  let mockApi: AcmeApiClient;

  beforeEach(() => {
    db = new Database(":memory:");
    const schema = new SqliteSchema()
      .register(AcmeRoot)
      .register(AcmeUser)
      .register(AcmeTeam);
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);

    syncMeta = new InMemorySyncMeta();
    taskStore = new InMemoryTaskStore();
    mockApi = createMockApi();
  });

  function createExecutor(api: AcmeApiClient = mockApi, store: InMemoryTaskStore = taskStore) {
    const registry = new ExecutionRegistryImpl([AcmeRootResolver, AcmeUserResolver, AcmeTeamResolver]);
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta,
      registry,
      flowController: new NoOpFlowController(),
      contextProvider: createContextProvider(api),
    });
    return new SyncExecutor({ taskRunner, taskStore: store });
  }

  test("seed → sync → data is in SQLite", async () => {
    const executor = createExecutor();

    // Seed and run sync
    const handle = await seedAndExecute(executor, mockApi, engine);
    const result = await handle.completion();

    expect(result.status).toBe("completed");

    // Verify users are in SQLite
    const users = await engine.query(AcmeUser).selectAll();
    expect(users.length).toBe(3);

    const alice = await engine.load(AcmeUser.ref("u1"), Fields.ALL);
    expect(alice.fields.name).toBe("Alice");
    expect(alice.fields.email).toBe("alice@acme.com");

    const bob = await engine.load(AcmeUser.ref("u2"), Fields.ALL);
    expect(bob.fields.name).toBe("Bob");
    expect(bob.fields.email).toBe("bob@acme.com");

    const charlie = await engine.load(AcmeUser.ref("u3"), Fields.ALL);
    expect(charlie.fields.name).toBe("Charlie");
    expect(charlie.fields.email).toBe("charlie@acme.com");
  });

  test("second sync re-processes entities (no staleness check yet)", async () => {
    const executor = createExecutor();

    // First sync
    const handle1 = await seedAndExecute(executor, mockApi, engine);
    await handle1.completion();

    // Track API calls in second sync
    let apiCallCount = 0;
    const trackedApi: AcmeApiClient = {
      ...mockApi,
      users: {
        ...mockApi.users,
        async get(id: string) {
          apiCallCount++;
          return mockApi.users.get(id);
        },
        async getBatch(ids: string[]) {
          apiCallCount++;
          return mockApi.users.getBatch(ids);
        },
      },
    };

    // Create new executor with tracked API (same engine, syncMeta)
    const executor2 = createExecutor(trackedApi, new InMemoryTaskStore());

    // Second sync
    const handle2 = await seedAndExecute(executor2, trackedApi, engine);
    await handle2.completion();

    // Data should still be there
    const users = await engine.query(AcmeUser).selectAll();
    expect(users.length).toBe(3);
  });

  test("collection pagination: multiple pages all processed", async () => {
    // Create API that returns members in pages of 2
    const pagedApi: AcmeApiClient = {
      ...mockApi,
      teams: {
        ...mockApi.teams,
        async listMembers(teamId: string, opts: { cursor?: string; limit?: number }) {
          const allMembers = ["u1", "u2", "u3"];
          const start = opts.cursor ? parseInt(opts.cursor, 10) : 0;
          const limit = 2; // Force small pages
          const slice = allMembers.slice(start, start + limit);
          const hasMore = start + limit < allMembers.length;
          const nextCursor = hasMore ? String(start + limit) : undefined;

          return {
            members: slice.map((userId) => ({ userId })),
            hasMore,
            nextCursor,
          };
        },
      },
    };

    const executor = createExecutor(pagedApi);

    const handle = await seedAndExecute(executor, pagedApi, engine);
    const result = await handle.completion();

    expect(result.status).toBe("completed");

    // All 3 users should be present despite pagination
    const users = await engine.query(AcmeUser).selectAll();
    expect(users.length).toBe(3);
  });

  test("SyncHandle: can check status", async () => {
    const executor = createExecutor();

    const handle = await seedAndExecute(executor, mockApi, engine);

    // Handle exists in registry
    const listed = await executor.syncs.list();
    expect(listed.length).toBeGreaterThanOrEqual(1);

    const found = await executor.syncs.get(handle.id);
    expect(found).not.toBeNull();

    // Await completion
    const result = await handle.completion();
    expect(result.status).toBe("completed");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  test("sync completes (not hangs) when a loader throws", async () => {
    // teams.get throws → step 2 (forAll AcmeTeam loadFields) fails
    // steps 3 & 4 are blocked by step 2 via blockedBy chain
    // BUG: failed task never unblocks dependents → they stay "new" → hasActiveTasks returns true → hang
    const failingApi: AcmeApiClient = {
      ...mockApi,
      teams: {
        ...mockApi.teams,
        async get(_id: string) {
          throw new Error("API unavailable");
        },
      },
    };

    const executor = createExecutor(failingApi);
    const handle = await seedAndExecute(executor, failingApi, engine);

    const result = await Promise.race([
      handle.completion(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2000)),
    ]);

    expect(result).not.toBe("timeout");
    if (result === "timeout") return; // type guard
    expect(result.tasksFailed).toBeGreaterThan(0);
  });

  test("sync completes (not hangs) when a child task throws", async () => {
    // listMembers throws → load-collection child task fails
    // parent sync-step stays in awaiting_children because allChildrenComplete
    // only checks for "completed", not "failed"
    // BUG: parent stuck in awaiting_children → hasActiveTasks returns true → hang
    const failingApi: AcmeApiClient = {
      ...mockApi,
      teams: {
        ...mockApi.teams,
        async listMembers(_teamId: string, _opts: { cursor?: string; limit?: number }) {
          throw new Error("Members API unavailable");
        },
      },
    };

    const executor = createExecutor(failingApi);
    const handle = await seedAndExecute(executor, failingApi, engine);

    const result = await Promise.race([
      handle.completion(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2000)),
    ]);

    expect(result).not.toBe("timeout");
    if (result === "timeout") return;
    expect(result.tasksFailed).toBeGreaterThan(0);
  });
});
