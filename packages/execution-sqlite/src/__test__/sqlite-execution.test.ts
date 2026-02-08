/**
 * E2E test for SQLite-backed execution layer.
 *
 * Tests: seed → sync → verify data in SQLite
 * Uses real SqliteEngine, SqliteTaskStore, SqliteSyncMeta.
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
import { DefaultTaskRunner, ExecutionRegistryImpl } from "@max/execution-local";
import type { AcmeApiClient } from "@max/connector-acme";

import { SqliteExecutionSchema } from "../schema.js";
import { SqliteTaskStore } from "../sqlite-task-store.js";
import { SqliteSyncMeta } from "../sqlite-sync-meta.js";

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

describe("SqliteExecution E2E", () => {
  let db: Database;
  let engine: SqliteEngine;
  let syncMeta: SqliteSyncMeta;
  let taskStore: SqliteTaskStore;
  let mockApi: AcmeApiClient;

  beforeEach(() => {
    db = new Database(":memory:");

    // Entity tables
    const schema = new SqliteSchema().register(AcmeRoot).register(AcmeUser).register(AcmeTeam);
    schema.ensureTables(db);

    // Execution tables
    new SqliteExecutionSchema().ensureTables(db);

    engine = new SqliteEngine(db, schema);
    syncMeta = new SqliteSyncMeta(db);
    taskStore = new SqliteTaskStore(db);
    mockApi = createMockApi();
  });

  function createExecutor(
    api: AcmeApiClient = mockApi,
    store: SqliteTaskStore = taskStore,
    meta: SqliteSyncMeta = syncMeta,
  ) {
    const registry = new ExecutionRegistryImpl([AcmeRootResolver, AcmeUserResolver, AcmeTeamResolver]);
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta: meta,
      registry,
      flowController: new NoOpFlowController(),
      contextProvider: createContextProvider(api),
    });
    return new SyncExecutor({ taskRunner, taskStore: store });
  }

  test("seed → sync → data is in SQLite", async () => {
    const executor = createExecutor();

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
  });

  test("task rows exist in _max_tasks", async () => {
    const executor = createExecutor();

    const handle = await seedAndExecute(executor, mockApi, engine);
    await handle.completion();

    // Verify task rows exist
    const taskCount = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks")
      .get() as { cnt: number };
    expect(taskCount.cnt).toBeGreaterThan(0);

    // All tasks should be completed
    const activeCount = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks WHERE state NOT IN ('completed')")
      .get() as { cnt: number };
    expect(activeCount.cnt).toBe(0);
  });

  test("sync_meta rows exist in _max_sync_meta", async () => {
    const executor = createExecutor();

    const handle = await seedAndExecute(executor, mockApi, engine);
    await handle.completion();

    // Verify sync metadata was recorded
    const metaCount = db
      .query("SELECT COUNT(*) as cnt FROM _max_sync_meta")
      .get() as { cnt: number };
    expect(metaCount.cnt).toBeGreaterThan(0);
  });

  test("restart: new executor on same DB can resume counter and read state", async () => {
    const executor = createExecutor();

    const handle = await seedAndExecute(executor, mockApi, engine);
    await handle.completion();

    // Get task count from first run
    const firstRunTasks = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks")
      .get() as { cnt: number };

    // Create a brand-new executor on the same DB (simulates restart)
    const newTaskStore = new SqliteTaskStore(db);
    const newSyncMeta = new SqliteSyncMeta(db);
    const executor2 = createExecutor(mockApi, newTaskStore, newSyncMeta);

    // Run a second sync
    const handle2 = await seedAndExecute(executor2, mockApi, engine);
    const result2 = await handle2.completion();
    expect(result2.status).toBe("completed");

    // Verify new tasks were created with higher IDs (counter resumed correctly)
    const secondRunTasks = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks")
      .get() as { cnt: number };
    expect(secondRunTasks.cnt).toBeGreaterThan(firstRunTasks.cnt);

    // Data should still be correct
    const users = await engine.query(AcmeUser).selectAll();
    expect(users.length).toBe(3);
  });
});
