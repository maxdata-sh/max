import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Tenant } from "../tenant.ts";

let tenant: Tenant;

beforeEach(() => {
  tenant = Tenant.create({ name: "test", storage: "memory" });
});

afterEach(() => {
  tenant.dispose();
});

describe("Tenant lifecycle", () => {
  test("creates a tenant with an API key", () => {
    const key = tenant.getApiKey();
    expect(key).toStartWith("acme_");
    expect(tenant.validateApiKey(key)).toBe(true);
    expect(tenant.validateApiKey("bogus")).toBe(false);
  });

  test("rotates API key", () => {
    const old = tenant.getApiKey();
    const newKey = tenant.rotateApiKey();
    expect(newKey).not.toBe(old);
    expect(tenant.validateApiKey(old)).toBe(false);
    expect(tenant.validateApiKey(newKey)).toBe(true);
  });
});

describe("CRUD operations", () => {
  test("workspace CRUD", () => {
    const ws = tenant.createWorkspace({ name: "Test Workspace" });
    expect(ws.name).toBe("Test Workspace");
    expect(ws.id).toStartWith("ws_");

    expect(tenant.getWorkspace(ws.id)).toEqual(ws);
    expect(tenant.listWorkspaces()).toHaveLength(1);

    const updated = tenant.updateWorkspace(ws.id, { name: "Renamed" });
    expect(updated.name).toBe("Renamed");

    tenant.deleteWorkspace(ws.id);
    expect(tenant.getWorkspace(ws.id)).toBeNull();
    expect(tenant.listWorkspaces()).toHaveLength(0);
  });

  test("user CRUD", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const user = tenant.createUser({
      workspaceId: ws.id,
      email: "test@acme.local",
      displayName: "Test User",
    });
    expect(user.id).toStartWith("usr_");
    expect(user.role).toBe("member");
    expect(user.active).toBe(true);

    const updated = tenant.updateUser(user.id, { role: "admin" });
    expect(updated.role).toBe("admin");

    expect(tenant.listUsers(ws.id)).toHaveLength(1);
    tenant.deleteUser(user.id);
    expect(tenant.listUsers(ws.id)).toHaveLength(0);
  });

  test("project CRUD", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const user = tenant.createUser({ workspaceId: ws.id, email: "a@b.c", displayName: "A" });
    const project = tenant.createProject({ workspaceId: ws.id, name: "Project Alpha", ownerId: user.id });

    expect(project.id).toStartWith("prj_");
    expect(project.status).toBe("active");

    const updated = tenant.updateProject(project.id, { status: "completed" });
    expect(updated.status).toBe("completed");
  });

  test("task CRUD with change history", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const user = tenant.createUser({ workspaceId: ws.id, email: "a@b.c", displayName: "A" });
    const project = tenant.createProject({ workspaceId: ws.id, name: "P", ownerId: user.id });

    const task = tenant.createTask({
      projectId: project.id,
      title: "Fix the bug",
      createdById: user.id,
      priority: "high",
      tags: ["bug"],
    });
    expect(task.id).toStartWith("tsk_");
    expect(task.status).toBe("todo");
    expect(task.tags).toEqual(["bug"]);

    const updated = tenant.updateTask(task.id, {
      status: "in_progress",
      lastModifiedById: user.id,
    });
    expect(updated.status).toBe("in_progress");

    // Check task history
    const history = tenant.getTaskHistory(task.id);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].changes).toHaveProperty("status");
    expect(history.entries[0].changes.status.before).toBe("todo");
    expect(history.entries[0].changes.status.after).toBe("in_progress");
  });

  test("file CRUD", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const user = tenant.createUser({ workspaceId: ws.id, email: "a@b.c", displayName: "A" });
    const project = tenant.createProject({ workspaceId: ws.id, name: "P", ownerId: user.id });

    const file = tenant.createFile({
      projectId: project.id,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      createdById: user.id,
    });
    expect(file.id).toStartWith("fil_");
    expect(file.sizeBytes).toBe(1024);

    const updated = tenant.updateFile(file.id, { name: "final-report.pdf", lastModifiedById: user.id });
    expect(updated.name).toBe("final-report.pdf");
  });
});

describe("Changelog", () => {
  test("forward event log tracks mutations in order", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const user = tenant.createUser({ workspaceId: ws.id, email: "a@b.c", displayName: "A" });
    const project = tenant.createProject({ workspaceId: ws.id, name: "P", ownerId: user.id });

    const { events } = tenant.getChanges();
    expect(events.length).toBe(3); // ws + user + project
    expect(events[0].entityType).toBe("workspace");
    expect(events[0].action).toBe("create");
    expect(events[1].entityType).toBe("user");
    expect(events[2].entityType).toBe("project");

    // Monotonically increasing
    for (let i = 1; i < events.length; i++) {
      expect(events[i].sequence).toBeGreaterThan(events[i - 1].sequence);
    }

    // Cursor-based pagination
    const { events: page2 } = tenant.getChanges(events[0].sequence, 1);
    expect(page2).toHaveLength(1);
    expect(page2[0].entityType).toBe("user");
  });

  test("create payload includes all fields", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const { events } = tenant.getChanges();
    expect(events[0].payload).not.toBeNull();
    expect(events[0].payload!.name).toBe("WS");
    expect(events[0].payload!.id).toBe(ws.id);
  });

  test("task update payload includes only changed fields", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const user = tenant.createUser({ workspaceId: ws.id, email: "a@b.c", displayName: "A" });
    const project = tenant.createProject({ workspaceId: ws.id, name: "P", ownerId: user.id });
    const task = tenant.createTask({ projectId: project.id, title: "T", createdById: user.id });

    const cursor = tenant.getLatestCursor();
    tenant.updateTask(task.id, { status: "done", lastModifiedById: user.id });

    const { events } = tenant.getChanges(cursor);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toHaveProperty("status");
    expect(events[0].payload).not.toHaveProperty("title"); // unchanged
  });

  test("file update payload is null (must re-fetch)", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const user = tenant.createUser({ workspaceId: ws.id, email: "a@b.c", displayName: "A" });
    const project = tenant.createProject({ workspaceId: ws.id, name: "P", ownerId: user.id });
    const file = tenant.createFile({ projectId: project.id, name: "f.txt", mimeType: "text/plain", sizeBytes: 10, createdById: user.id });

    const cursor = tenant.getLatestCursor();
    tenant.updateFile(file.id, { name: "g.txt", lastModifiedById: user.id });

    const { events } = tenant.getChanges(cursor);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("update");
    expect(events[0].payload).toBeNull();
  });

  test("delete payload is null", () => {
    const ws = tenant.createWorkspace({ name: "WS" });
    const cursor = tenant.getLatestCursor();
    tenant.deleteWorkspace(ws.id);

    const { events } = tenant.getChanges(cursor);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("delete");
    expect(events[0].payload).toBeNull();
  });
});

describe("Webhooks", () => {
  test("in-process webhook callbacks fire on mutation", () => {
    const received: any[] = [];
    tenant.onWebhook((p) => received.push(p));

    tenant.createWorkspace({ name: "WS" });

    expect(received).toHaveLength(1);
    expect(received[0].entityType).toBe("workspace");
    expect(received[0].action).toBe("create");
    expect(received[0].cursor).toBeGreaterThan(0);
  });

  test("unsubscribe stops callbacks", () => {
    const received: any[] = [];
    const unsub = tenant.onWebhook((p) => received.push(p));

    tenant.createWorkspace({ name: "A" });
    expect(received).toHaveLength(1);

    unsub();
    tenant.createWorkspace({ name: "B" });
    expect(received).toHaveLength(1); // still 1
  });
});

describe("Seeding", () => {
  test("seeds default amounts", async () => {
    const result = await tenant.seed();
    expect(result.workspaces).toBe(1);
    expect(result.users).toBe(6); // 5 + 1 ghost
    expect(result.projects).toBe(3);
    expect(result.tasks).toBe(30);
    expect(result.files).toBe(15);

    // Verify data exists
    expect(tenant.listWorkspaces()).toHaveLength(1);
    expect(tenant.listUsers()).toHaveLength(6);
  });

  test("deterministic: same seed produces identical data", async () => {
    const t1 = Tenant.create({ name: "t1", storage: "memory" });
    const t2 = Tenant.create({ name: "t2", storage: "memory" });

    await t1.seed({ globalSeed: 123 });
    await t2.seed({ globalSeed: 123 });

    const users1 = t1.listUsers().map((u) => u.displayName).sort();
    const users2 = t2.listUsers().map((u) => u.displayName).sort();
    expect(users1).toEqual(users2);

    t1.dispose();
    t2.dispose();
  });
});

describe("Stats", () => {
  test("returns correct counts", async () => {
    await tenant.seed();
    const stats = tenant.getStats();
    expect(stats.workspaces).toBe(1);
    expect(stats.users).toBe(6);
    expect(stats.projects).toBe(3);
    expect(stats.tasks).toBe(30);
    expect(stats.files).toBe(15);
    expect(stats.changelogSize).toBeGreaterThan(0);
  });
});
