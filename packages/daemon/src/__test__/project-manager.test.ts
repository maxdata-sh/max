import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ConnectorType } from "@max/core";
import { ProjectManager } from "../project-manager/project-manager.js";

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "max-pm-test-"));
}

function initProject(dir: string): void {
  fs.mkdirSync(path.join(dir, ".max"), { recursive: true });
}

// Convenience — ConnectorType is a soft brand, raw strings work fine
const acme: ConnectorType = "acme";
const linear: ConnectorType = "linear";

beforeEach(() => {
  tmpDir = createTmpDir();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// prepare
// ============================================================================

describe("prepare", () => {
  test("auto-assigns 'default' slug for first installation", () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme);
    expect(pending.connector).toBe("acme");
    expect(pending.name).toBe("default");
  });

  test("uses explicit slug when provided", () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme, "staging");
    expect(pending.name).toBe("staging");
  });

  test("auto-increments slug when default exists", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), {});

    const p2 = pm.prepare(acme);
    expect(p2.name).toBe("default-2");
  });

  test("auto-increments past multiple existing defaults", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    await pm.commit(pm.prepare(acme), {}); // default-2

    const p3 = pm.prepare(acme);
    expect(p3.name).toBe("default-3");
  });

  test("throws when connector:slug already exists", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    expect(() => pm.prepare(acme, "default")).toThrow("already exists");
  });

  test("works without .max directory (no conflicts possible)", () => {
    // No initProject — .max doesn't exist
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme);
    expect(pending.name).toBe("default");
  });
});

// ============================================================================
// commit
// ============================================================================

describe("commit", () => {
  test("persists installation and returns ManagedInstallation", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme);
    const managed = await pm.commit(pending, { workspaceId: "ws-1" });

    expect(managed.connector).toBe("acme");
    expect(managed.name).toBe("default");
    expect(managed.id).toBeDefined();
    expect(managed.config).toEqual({ workspaceId: "ws-1" });
    expect(managed.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("creates installation.json on disk", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), { key: "val" });

    const filePath = path.join(tmpDir, ".max", "installations", "acme", "default", "installation.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.config).toEqual({ key: "val" });
  });

  test("auto-creates .max on first commit when not initialised", async () => {
    // No initProject — .max doesn't exist
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme);
    await pm.commit(pending, {});

    expect(fs.existsSync(path.join(tmpDir, ".max", "installations", "acme", "default", "installation.json"))).toBe(true);
  });

  test("throws on duplicate commit (race guard)", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const p1 = pm.prepare(acme);
    await pm.commit(p1, {});

    // Simulate a second commit with the same connector:slug
    const fake = { connector: acme, name: "default" };
    expect(pm.commit(fake, {})).rejects.toThrow("already exists");
  });
});

// ============================================================================
// get
// ============================================================================

describe("get", () => {
  test("loads a committed installation", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), { key: "val" });

    const installation = pm.get(acme);
    expect(installation.connector).toBe("acme");
    expect(installation.name).toBe("default");
    expect(installation.config).toEqual({ key: "val" });
  });

  test("loads by explicit slug", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme, "staging"), { env: "staging" });

    const installation = pm.get(acme, "staging");
    expect(installation.config).toEqual({ env: "staging" });
  });

  test("resolves the only installation when no default exists", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme, "staging"), {});

    // No "default" slug, but only one installation — resolves to it
    const installation = pm.get(acme);
    expect(installation.name).toBe("staging");
  });

  test("throws when connector has no installations", () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    expect(() => pm.get(acme)).toThrow("No installation found");
  });

  test("throws when not in a project", () => {
    const pm = ProjectManager.create(tmpDir);

    expect(() => pm.get(acme)).toThrow("Not a Max project");
  });
});

// ============================================================================
// has
// ============================================================================

describe("has", () => {
  test("returns true for existing installation", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), {});

    expect(pm.has(acme)).toBe(true);
    expect(pm.has(acme, "default")).toBe(true);
  });

  test("returns false for missing installation", () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    expect(pm.has(acme)).toBe(false);
  });

  test("returns false when not in a project", () => {
    const pm = ProjectManager.create(tmpDir);

    expect(pm.has(acme)).toBe(false);
  });
});

// ============================================================================
// list
// ============================================================================

describe("list", () => {
  test("returns empty array when no installations exist", () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    expect(pm.list()).toEqual([]);
  });

  test("returns all installations sorted by connector then slug", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(linear), {});
    await pm.commit(pm.prepare(acme, "staging"), {});
    await pm.commit(pm.prepare(acme), {});

    const list = pm.list();
    expect(list).toHaveLength(3);
    expect(list[0].connector).toBe("acme");
    expect(list[0].name).toBe("default");
    expect(list[1].connector).toBe("acme");
    expect(list[1].name).toBe("staging");
    expect(list[2].connector).toBe("linear");
  });

  test("omits config from results", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), { secret: "data" });

    const list = pm.list();
    expect(list[0]).not.toHaveProperty("config");
  });

  test("returns empty when not in a project", () => {
    const pm = ProjectManager.create(tmpDir);

    expect(pm.list()).toEqual([]);
  });
});

// ============================================================================
// delete
// ============================================================================

describe("delete", () => {
  test("removes an installation", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    expect(pm.has(acme)).toBe(true);

    await pm.delete(acme);
    expect(pm.has(acme)).toBe(false);
  });

  test("removes credentials alongside installation", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme);
    const creds = pm.credentialStoreFor(pending);
    await creds.set("token", "sk-123");
    await pm.commit(pending, {});

    const credsPath = path.join(tmpDir, ".max", "installations", "acme", "default", "credentials.json");
    expect(fs.existsSync(credsPath)).toBe(true);

    await pm.delete(acme);
    expect(fs.existsSync(credsPath)).toBe(false);
  });

  test("cleans up empty connector directory", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    await pm.delete(acme);

    const connectorDir = path.join(tmpDir, ".max", "installations", "acme");
    expect(fs.existsSync(connectorDir)).toBe(false);
  });

  test("throws for missing installation", () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    expect(pm.delete(acme)).rejects.toThrow("No installation found");
  });

  test("throws when not in a project", () => {
    const pm = ProjectManager.create(tmpDir);

    expect(pm.delete(acme)).rejects.toThrow("Not a Max project");
  });
});

// ============================================================================
// credentialStoreFor
// ============================================================================

describe("credentialStoreFor", () => {
  test("reads and writes credentials for a pending installation", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme);
    const store = pm.credentialStoreFor(pending);

    await store.set("api_token", "sk-123");
    expect(await store.get("api_token")).toBe("sk-123");
    expect(await store.has("api_token")).toBe(true);
    expect(await store.keys()).toEqual(["api_token"]);
  });

  test("credentials persist across store instances", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const pending = pm.prepare(acme);
    const store1 = pm.credentialStoreFor(pending);
    await store1.set("token", "val");

    const store2 = pm.credentialStoreFor(pending);
    expect(await store2.get("token")).toBe("val");
  });

  test("throws for missing credential key", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const store = pm.credentialStoreFor(pm.prepare(acme));
    expect(store.get("nope")).rejects.toThrow('Credential "nope" not found');
  });

  test("scopes credentials per installation", async () => {
    initProject(tmpDir);
    const pm = ProjectManager.create(tmpDir);

    const p1 = pm.prepare(acme);
    const p2 = pm.prepare(linear);

    const s1 = pm.credentialStoreFor(p1);
    const s2 = pm.credentialStoreFor(p2);

    await s1.set("token", "acme-token");
    await s2.set("token", "linear-token");

    expect(await s1.get("token")).toBe("acme-token");
    expect(await s2.get("token")).toBe("linear-token");
  });
});

// ============================================================================
// Walk mechanism
// ============================================================================

describe("walk mechanism", () => {
  test("finds .max in a parent directory", async () => {
    initProject(tmpDir);
    const subDir = path.join(tmpDir, "deep", "nested", "dir");
    fs.mkdirSync(subDir, { recursive: true });

    // Create PM rooted at the subdirectory
    const pm = ProjectManager.create(subDir);

    // commit should write to the parent's .max
    await pm.commit(pm.prepare(acme), {});

    const filePath = path.join(tmpDir, ".max", "installations", "acme", "default", "installation.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test("get works from a subdirectory", async () => {
    initProject(tmpDir);
    const pm1 = ProjectManager.create(tmpDir);
    await pm1.commit(pm1.prepare(acme), { env: "prod" });

    // Access from a subdirectory
    const subDir = path.join(tmpDir, "src");
    fs.mkdirSync(subDir);
    const pm2 = ProjectManager.create(subDir);

    const installation = pm2.get(acme);
    expect(installation.config).toEqual({ env: "prod" });
  });

  test("commit creates .max at startDir when no project found", async () => {
    // No .max anywhere — commit creates it at startDir
    const pm = ProjectManager.create(tmpDir);
    await pm.commit(pm.prepare(acme), {});

    expect(fs.existsSync(path.join(tmpDir, ".max", "installations", "acme", "default", "installation.json"))).toBe(true);
  });
});
