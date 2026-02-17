/**
 * E2E test for the sync execution layer.
 *
 * Tests: seed → sync → verify stored data
 * Uses real SqliteEngine, InMemoryTaskStore, InMemorySyncMeta.
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
import { InMemoryTaskStore } from "../in-memory-task-store.js";
import { InMemorySyncMeta } from "../in-memory-sync-meta.js";
import { LocalSyncQueryEngine } from "../local-sync-query-engine.js";
import { DefaultTaskRunner } from "../default-task-runner.js";
import { ExecutionRegistryImpl } from "../execution-registry-impl.js";

// ============================================================================
// Mock API (matches AcmeClient shape — loaders access ctx.api.client.xxx())
// ============================================================================

interface MockHttpClient {
  listWorkspaces(): Promise<Array<{ id: string; name: string; createdAt: string; updatedAt: string }>>;
  getWorkspace(id: string): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }>;
  listUsers(workspaceId?: string): Promise<Array<{ id: string; displayName: string; email: string; role: string; active: boolean; workspaceId: string; createdAt: string; updatedAt: string }>>;
  getUser(id: string): Promise<{ id: string; displayName: string; email: string; role: string; active: boolean; workspaceId: string; createdAt: string; updatedAt: string }>;
  listProjects(workspaceId?: string): Promise<Array<{ id: string; name: string; description: string | null; status: string; ownerId: string; workspaceId: string; createdAt: string; updatedAt: string }>>;
}

interface MockAcmeClient {
  client: MockHttpClient;
}

function createMockApi(): MockAcmeClient {
  const users = [
    { id: "u1", displayName: "Alice", email: "alice@acme.com", role: "admin", active: true, workspaceId: "ws1", createdAt: "", updatedAt: "" },
    { id: "u2", displayName: "Bob", email: "bob@acme.com", role: "member", active: true, workspaceId: "ws1", createdAt: "", updatedAt: "" },
    { id: "u3", displayName: "Charlie", email: "charlie@acme.com", role: "member", active: false, workspaceId: "ws1", createdAt: "", updatedAt: "" },
  ];

  const httpClient: MockHttpClient = {
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
  };

  return { client: httpClient };
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

describe("SyncExecutor E2E", () => {
  let db: Database;
  let engine: SqliteEngine;
  let syncMeta: InMemorySyncMeta;
  let taskStore: InMemoryTaskStore;
  let mockApi: MockAcmeClient;

  beforeEach(() => {
    db = new Database(":memory:");
    const schema = new SqliteSchema().registerSchema(AcmeSchema)
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);

    syncMeta = new InMemorySyncMeta();
    taskStore = new InMemoryTaskStore();
    mockApi = createMockApi();
  });

  function createExecutor(api: MockAcmeClient = mockApi, store: InMemoryTaskStore = taskStore) {
    const registry = new ExecutionRegistryImpl(AcmeConnector.def.resolvers);
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
    const users = await engine.query(Query.from(AcmeUser).selectAll());
    expect(users.items.length).toBe(3);

    const alice = await engine.load(AcmeUser.ref("u1"), Fields.ALL);
    expect(alice.fields.displayName).toBe("Alice");
    expect(alice.fields.email).toBe("alice@acme.com");

    const bob = await engine.load(AcmeUser.ref("u2"), Fields.ALL);
    expect(bob.fields.displayName).toBe("Bob");
    expect(bob.fields.email).toBe("bob@acme.com");

    const charlie = await engine.load(AcmeUser.ref("u3"), Fields.ALL);
    expect(charlie.fields.displayName).toBe("Charlie");
    expect(charlie.fields.email).toBe("charlie@acme.com");
  });

  test("second sync re-processes entities (no staleness check yet)", async () => {
    const executor = createExecutor();

    // First sync
    const handle1 = await seedAndExecute(executor, mockApi, engine);
    await handle1.completion();

    // Create new executor (same engine, syncMeta)
    const executor2 = createExecutor(mockApi, new InMemoryTaskStore());

    // Second sync
    const handle2 = await seedAndExecute(executor2, mockApi, engine);
    await handle2.completion();

    // Data should still be there
    const users = await engine.query(Query.from(AcmeUser).selectAll());
    expect(users.items.length).toBe(3);
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
    const failingApi: MockAcmeClient = {
      client: {
        ...mockApi.client,
        async getWorkspace(_id: string) {
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
    const failingApi: MockAcmeClient = {
      client: {
        ...mockApi.client,
        async listUsers(_workspaceId?: string) {
          throw new Error("Users API unavailable");
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
