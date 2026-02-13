import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { AcmeTestClient } from "../test-client.ts";
import type { AcmeClient } from "../client.ts";

let testClient: AcmeTestClient;
let client: AcmeClient; // use the interface — proves it's assignable

beforeAll(async () => {
  testClient = new AcmeTestClient();
  client = testClient;
  await testClient.seed({ workspaces: 1, usersPerWorkspace: 3, projectsPerWorkspace: 2, tasksPerProject: 5, filesPerProject: 2 });
});

afterAll(() => {
  testClient.dispose();
});

describe("AcmeTestClient", () => {
  test("seeded data is accessible via the AcmeClient interface", async () => {
    const workspaces = await client.listWorkspaces();
    expect(workspaces).toHaveLength(1);

    const users = await client.listUsers(workspaces[0].id);
    expect(users).toHaveLength(4); // 3 + 1 ghost

    const projects = await client.listProjects(workspaces[0].id);
    expect(projects).toHaveLength(2);

    const tasks = await client.listTasks(projects[0].id);
    expect(tasks).toHaveLength(5);

    const files = await client.listFiles(projects[0].id);
    expect(files).toHaveLength(2);
  });

  test("get individual entities", async () => {
    const workspaces = await client.listWorkspaces();
    const ws = await client.getWorkspace(workspaces[0].id);
    expect(ws.id).toBe(workspaces[0].id);

    const users = await client.listUsers();
    const user = await client.getUser(users[0].id);
    expect(user.id).toBe(users[0].id);
  });

  test("CRUD operations work through the interface", async () => {
    const ws = (await client.listWorkspaces())[0];
    const users = await client.listUsers(ws.id);

    const task = await client.createTask({
      projectId: (await client.listProjects())[0].id,
      title: "Test client task",
      createdById: users[0].id,
    });
    expect(task.title).toBe("Test client task");

    const updated = await client.updateTask(task.id, {
      status: "in_progress",
      lastModifiedById: users[0].id,
    });
    expect(updated.status).toBe("in_progress");

    await client.deleteTask(task.id);
    expect(client.getTask(task.id)).rejects.toThrow("not found");
  });

  test("changelog reflects seeded data", async () => {
    const { events, nextCursor } = await client.getChanges({ limit: 5 });
    expect(events).toHaveLength(5);
    expect(nextCursor).toBe(events[4].sequence);

    const recent = await client.getRecentChanges(3);
    expect(recent).toHaveLength(3);
    // Newest first
    expect(recent[0].sequence).toBeGreaterThan(recent[1].sequence);
  });

  test("task history available after updates", async () => {
    const ws = (await client.listWorkspaces())[0];
    const users = await client.listUsers(ws.id);
    const project = (await client.listProjects())[0];

    const task = await client.createTask({
      projectId: project.id,
      title: "History test",
      createdById: users[0].id,
    });

    await client.updateTask(task.id, { priority: "critical", lastModifiedById: users[0].id });
    await client.updateTask(task.id, { status: "done", lastModifiedById: users[1].id });

    const { entries } = await client.getTaskHistory(task.id);
    expect(entries).toHaveLength(2);
    expect(entries[0].changes).toHaveProperty("status"); // most recent first
    expect(entries[1].changes).toHaveProperty("priority");
  });

  test("deterministic seeding produces identical data", async () => {
    const a = new AcmeTestClient();
    const b = new AcmeTestClient();
    await a.seed({ globalSeed: 99 });
    await b.seed({ globalSeed: 99 });

    const usersA = (await a.listUsers()).map(u => u.displayName).sort();
    const usersB = (await b.listUsers()).map(u => u.displayName).sort();
    expect(usersA).toEqual(usersB);

    a.dispose();
    b.dispose();
  });

  test("exposes tenant for direct access when needed", () => {
    expect(testClient.tenant).toBeDefined();
    expect(testClient.tenant.name).toBe("test");
  });
});
