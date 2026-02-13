import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Tenant } from "../tenant.ts";
import { AcmeHttpClient } from "../client.ts";
import { startServer } from "../server.ts";

let tenant: Tenant;
let client: AcmeHttpClient;
let stop: () => void;

beforeAll(async () => {
  tenant = Tenant.create({ name: "client-test", storage: "memory" });
  const server = startServer(tenant, { port: 0 });
  stop = server.stop;
  client = new AcmeHttpClient({ baseUrl: server.url, apiKey: tenant.getApiKey() });
});

afterAll(() => {
  stop();
  tenant.dispose();
});

describe("AcmeHttpClient", () => {
  let workspaceId: string;
  let userId: string;
  let projectId: string;
  let taskId: string;
  let fileId: string;

  test("workspace CRUD", async () => {
    const ws = await client.createWorkspace({ name: "Client Test WS" });
    expect(ws.id).toStartWith("ws_");
    expect(ws.name).toBe("Client Test WS");
    workspaceId = ws.id;

    const fetched = await client.getWorkspace(ws.id);
    expect(fetched.name).toBe("Client Test WS");

    const updated = await client.updateWorkspace(ws.id, { name: "Renamed WS" });
    expect(updated.name).toBe("Renamed WS");

    const list = await client.listWorkspaces();
    expect(list.some((w) => w.id === ws.id)).toBe(true);
  });

  test("user CRUD", async () => {
    const user = await client.createUser({
      workspaceId,
      email: "test@acme.local",
      displayName: "Test User",
    });
    expect(user.id).toStartWith("usr_");
    userId = user.id;

    const fetched = await client.getUser(user.id);
    expect(fetched.displayName).toBe("Test User");

    const updated = await client.updateUser(user.id, { role: "admin" });
    expect(updated.role).toBe("admin");

    const list = await client.listUsers(workspaceId);
    expect(list).toHaveLength(1);
  });

  test("project CRUD", async () => {
    const project = await client.createProject({
      workspaceId,
      name: "Test Project",
      ownerId: userId,
    });
    expect(project.id).toStartWith("prj_");
    projectId = project.id;

    const fetched = await client.getProject(project.id);
    expect(fetched.name).toBe("Test Project");

    const updated = await client.updateProject(project.id, { status: "paused" });
    expect(updated.status).toBe("paused");

    const list = await client.listProjects(workspaceId);
    expect(list).toHaveLength(1);
  });

  test("task CRUD", async () => {
    const task = await client.createTask({
      projectId,
      title: "Fix all the things",
      createdById: userId,
      priority: "high",
      tags: ["bug"],
    });
    expect(task.id).toStartWith("tsk_");
    expect(task.tags).toEqual(["bug"]);
    taskId = task.id;

    const fetched = await client.getTask(task.id);
    expect(fetched.title).toBe("Fix all the things");

    const updated = await client.updateTask(task.id, {
      status: "in_progress",
      lastModifiedById: userId,
    });
    expect(updated.status).toBe("in_progress");

    const list = await client.listTasks(projectId);
    expect(list).toHaveLength(1);
  });

  test("file CRUD", async () => {
    const file = await client.createFile({
      projectId,
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      createdById: userId,
    });
    expect(file.id).toStartWith("fil_");
    fileId = file.id;

    const fetched = await client.getFile(file.id);
    expect(fetched.name).toBe("spec.pdf");

    const updated = await client.updateFile(file.id, {
      name: "spec-v2.pdf",
      lastModifiedById: userId,
    });
    expect(updated.name).toBe("spec-v2.pdf");

    const list = await client.listFiles(projectId);
    expect(list).toHaveLength(1);
  });

  test("changelog: getChanges with cursor pagination", async () => {
    const { events, nextCursor } = await client.getChanges({ limit: 3 });
    expect(events).toHaveLength(3);
    expect(nextCursor).toBe(events[2].sequence);

    const page2 = await client.getChanges({ since: nextCursor, limit: 3 });
    expect(page2.events[0].sequence).toBeGreaterThan(nextCursor);
  });

  test("changelog: getRecentChanges returns newest first", async () => {
    const recent = await client.getRecentChanges(5);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThanOrEqual(5);
    // Newest first
    for (let i = 1; i < recent.length; i++) {
      expect(recent[i].sequence).toBeLessThan(recent[i - 1].sequence);
    }
  });

  test("task history", async () => {
    const { entries } = await client.getTaskHistory(taskId);
    expect(entries).toHaveLength(1);
    expect(entries[0].changes).toHaveProperty("status");
    expect(entries[0].changes.status.before).toBe("todo");
    expect(entries[0].changes.status.after).toBe("in_progress");
  });

  test("webhooks: register and list", async () => {
    const wh = await client.registerWebhook("http://example.com/hook");
    expect(wh.id).toStartWith("wh_");
    expect(wh.url).toBe("http://example.com/hook");

    const list = await client.listWebhooks();
    expect(list.some((w) => w.id === wh.id)).toBe(true);

    await client.deleteWebhook(wh.id);
    const after = await client.listWebhooks();
    expect(after.some((w) => w.id === wh.id)).toBe(false);
  });

  test("delete entities", async () => {
    await client.deleteFile(fileId);
    await client.deleteTask(taskId);
    await client.deleteProject(projectId);
    await client.deleteUser(userId);
    await client.deleteWorkspace(workspaceId);

    expect(await client.listWorkspaces()).toHaveLength(0);
  });

  test("auth: rejects bad API key", async () => {
    const bad = new AcmeHttpClient({ baseUrl: client["baseUrl"], apiKey: "bogus" });
    expect(bad.listWorkspaces()).rejects.toThrow("403");
  });
});
