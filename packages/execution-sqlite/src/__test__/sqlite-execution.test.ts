/**
 * E2E test for SQLite-backed execution layer.
 *
 * Tests: seed → sync → verify data in SQLite
 * Uses real SqliteEngine, SqliteTaskStore, SqliteSyncMeta.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Context, Fields, NoOpFlowController, Query } from "@max/core";
import { SqliteEngine, SqliteSchema } from "@max/storage-sqlite";
import AcmeConnector, {
  AcmeRoot,
  AcmeUser,
  AcmeWorkspace,
  AcmeAppContext,
  AcmeRootResolver,
  AcmeUserResolver,
  AcmeWorkspaceResolver,
  AcmeSeeder, AcmeSchema,
} from "@max/connector-acme";
import { SyncExecutor } from "@max/execution";
import { DefaultTaskRunner, ExecutionRegistryImpl } from "@max/execution-local";

import { SqliteExecutionSchema } from "../schema.js";
import { SqliteTaskStore } from "../sqlite-task-store.js";
import { SqliteSyncMeta } from "../sqlite-sync-meta.js";

// ============================================================================
// Mock API (matches AcmeClient shape — loaders access ctx.api.client.xxx())
// ============================================================================

interface MockAcmeClient {
  client: {
    listWorkspaces(): Promise<Array<{ id: string; name: string; createdAt: string; updatedAt: string }>>;
    getWorkspace(id: string): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }>;
    listUsers(workspaceId?: string): Promise<Array<{ id: string; displayName: string; email: string; role: string; active: boolean; workspaceId: string; createdAt: string; updatedAt: string }>>;
    getUser(id: string): Promise<{ id: string; displayName: string; email: string; role: string; active: boolean; workspaceId: string; createdAt: string; updatedAt: string }>;
    listProjects(workspaceId?: string): Promise<any[]>;
  };
}

function createMockApi(): MockAcmeClient {
  const users = [
    { id: "u1", displayName: "Alice", email: "alice@acme.com", role: "admin", active: true, workspaceId: "ws1", createdAt: "", updatedAt: "" },
    { id: "u2", displayName: "Bob", email: "bob@acme.com", role: "member", active: true, workspaceId: "ws1", createdAt: "", updatedAt: "" },
    { id: "u3", displayName: "Charlie", email: "charlie@acme.com", role: "member", active: false, workspaceId: "ws1", createdAt: "", updatedAt: "" },
  ];

  return {
    client: {
      async listWorkspaces() {
        return [{ id: "ws1", name: "Test Workspace", createdAt: "", updatedAt: "" }];
      },
      async getWorkspace(id: string) {
        return { id, name: "Test Workspace", createdAt: "", updatedAt: "" };
      },
      async listUsers(_workspaceId?: string) {
        return users;
      },
      async getUser(id: string) {
        const user = users.find((u) => u.id === id);
        if (!user) throw new Error(`User not found: ${id}`);
        return user;
      },
      async listProjects(_workspaceId?: string) {
        return [];
      },
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createContextProvider(api: MockAcmeClient) {
  return async () =>
    Context.build(AcmeAppContext, {
      api: api as any,
      workspaceId: "ws1",
    });
}

async function seedAndExecute(executor: SyncExecutor, api: MockAcmeClient, engine: SqliteEngine) {
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
  let mockApi: MockAcmeClient;

  beforeEach(() => {
    db = new Database(":memory:");

    // Entity tables
    const schema = new SqliteSchema().registerSchema(AcmeSchema)

    schema.ensureTables(db);

    // Execution tables
    SqliteExecutionSchema.ensureTables(db);

    engine = new SqliteEngine(db, schema);
    syncMeta = new SqliteSyncMeta(db);
    taskStore = new SqliteTaskStore(db);
    mockApi = createMockApi();
  });

  function createExecutor(
    api: MockAcmeClient = mockApi,
    store: SqliteTaskStore = taskStore,
    meta: SqliteSyncMeta = syncMeta,
  ) {
    const registry = new ExecutionRegistryImpl(AcmeConnector.def.resolvers);
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
    const users = await engine.query(Query.from(AcmeUser).selectAll());
    expect(users.items.length).toBe(3);

    const alice = await engine.load(AcmeUser.ref("u1"), Fields.ALL);
    expect(alice.fields.displayName).toBe("Alice");
    expect(alice.fields.email).toBe("alice@acme.com");

    const bob = await engine.load(AcmeUser.ref("u2"), Fields.ALL);
    expect(bob.fields.displayName).toBe("Bob");
  });

  test("task rows exist in _max_tasks", async () => {
    const executor = createExecutor();

    const handle = await seedAndExecute(executor, mockApi, engine);
    await handle.completion();

    const taskCount = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks")
      .get() as { cnt: number };
    expect(taskCount.cnt).toBeGreaterThan(0);

    const activeCount = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks WHERE state NOT IN ('completed')")
      .get() as { cnt: number };
    expect(activeCount.cnt).toBe(0);
  });

  test("sync_meta rows exist in _max_sync_meta", async () => {
    const executor = createExecutor();

    const handle = await seedAndExecute(executor, mockApi, engine);
    await handle.completion();

    const metaCount = db
      .query("SELECT COUNT(*) as cnt FROM _max_sync_meta")
      .get() as { cnt: number };
    expect(metaCount.cnt).toBeGreaterThan(0);
  });

  test("restart: new executor on same DB can resume counter and read state", async () => {
    const executor = createExecutor();

    const handle = await seedAndExecute(executor, mockApi, engine);
    await handle.completion();

    const firstRunTasks = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks")
      .get() as { cnt: number };

    // Create a brand-new executor on the same DB (simulates restart)
    const newTaskStore = new SqliteTaskStore(db);
    const newSyncMeta = new SqliteSyncMeta(db);
    const executor2 = createExecutor(mockApi, newTaskStore, newSyncMeta);

    const handle2 = await seedAndExecute(executor2, mockApi, engine);
    const result2 = await handle2.completion();
    expect(result2.status).toBe("completed");

    const secondRunTasks = db
      .query("SELECT COUNT(*) as cnt FROM _max_tasks")
      .get() as { cnt: number };
    expect(secondRunTasks.cnt).toBeGreaterThan(firstRunTasks.cnt);

    const users = await engine.query(Query.from(AcmeUser).selectAll());
    expect(users.items.length).toBe(3);
  });
});
