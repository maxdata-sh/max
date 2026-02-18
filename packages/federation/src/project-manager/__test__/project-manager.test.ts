import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ConnectorType } from "@max/core";
import {FsProjectManager} from "../fs-project-manager.js";

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "max-pm-test-"));
}

function initProject(dir: string): FsProjectManager {
  return FsProjectManager.init(dir);
}

const acme: ConnectorType = "acme";
const linear: ConnectorType = "linear";

beforeEach(() => {
  tmpDir = createTmpDir();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// Construction
// ============================================================================

describe("construction", () => {
  test("succeeds when .max and max.json exist at the given path", () => {
    fs.mkdirSync(path.join(tmpDir, ".max"));
    fs.writeFileSync(path.join(tmpDir, "max.json"), "{}");
    expect(() => new FsProjectManager(tmpDir)).not.toThrow();
  });

  test("throws when .max exists but max.json is missing", () => {
    fs.mkdirSync(path.join(tmpDir, ".max"));
    expect(() => new FsProjectManager(tmpDir)).toThrow("Not a Max project");
  });

  test("throws when .max does not exist", () => {
    expect(() => new FsProjectManager(tmpDir)).toThrow("Not a Max project");
  });

  test("init creates .max and returns a valid ProjectManager", async () => {
    const pm = FsProjectManager.init(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, ".max"))).toBe(true);

    // Verify it works
    const pending = pm.prepare(acme);
    await pm.commit(pending, {});
    expect(pm.has(acme)).toBe(true);
  });
});


// ============================================================================
// prepare
// ============================================================================

describe("prepare", () => {
  test("auto-assigns 'default' slug for first installation", () => {
    const pm = initProject(tmpDir);

    const pending = pm.prepare(acme);
    expect(pending.connector).toBe("acme");
    expect(pending.name).toBe("default");
  });

  test("uses explicit slug when provided", () => {
    const pm = initProject(tmpDir);

    const pending = pm.prepare(acme, "staging");
    expect(pending.name).toBe("staging");
  });

  test("auto-increments slug when default exists", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    expect(pm.prepare(acme).name).toBe("default-2");
  });

  test("auto-increments past multiple existing defaults", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    await pm.commit(pm.prepare(acme), {});
    expect(pm.prepare(acme).name).toBe("default-3");
  });

  test("throws when connector:slug already exists", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    expect(() => pm.prepare(acme, "default")).toThrow("already exists");
  });
});

// ============================================================================
// commit
// ============================================================================

describe("commit", () => {
  test("persists installation and returns ManagedInstallation", async () => {
    const pm = initProject(tmpDir);

    const managed = await pm.commit(pm.prepare(acme), { workspaceId: "ws-1" });

    expect(managed.connector).toBe("acme");
    expect(managed.name).toBe("default");
    expect(managed.id).toBeDefined();
    expect(managed.config).toEqual({ workspaceId: "ws-1" });
    expect(managed.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("creates installation.json on disk", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), { key: "val" });

    const filePath = path.join(tmpDir, ".max", "installations", "acme", "default", "installation.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.config).toEqual({ key: "val" });
  });

  test("throws on duplicate commit (race guard)", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), {});

    const fake = { connector: acme, name: "default" };
    expect(pm.commit(fake, {})).rejects.toThrow("already exists");
  });
});

// ============================================================================
// get
// ============================================================================

describe("get", () => {
  test("loads a committed installation", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), { key: "val" });

    const installation = pm.get(acme);
    expect(installation.connector).toBe("acme");
    expect(installation.name).toBe("default");
    expect(installation.config).toEqual({ key: "val" });
  });

  test("loads by explicit slug", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme, "staging"), { env: "staging" });

    const installation = pm.get(acme, "staging");
    expect(installation.config).toEqual({ env: "staging" });
  });

  test("resolves the only installation when no default exists", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme, "staging"), {});

    const installation = pm.get(acme);
    expect(installation.name).toBe("staging");
  });

  test("throws when connector has no installations", () => {
    const pm = initProject(tmpDir);
    expect(() => pm.get(acme)).toThrow("No installation found");
  });
});

// ============================================================================
// has
// ============================================================================

describe("has", () => {
  test("returns true for existing installation", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), {});

    expect(pm.has(acme)).toBe(true);
    expect(pm.has(acme, "default")).toBe(true);
  });

  test("returns false for missing installation", () => {
    const pm = initProject(tmpDir);
    expect(pm.has(acme)).toBe(false);
  });
});

// ============================================================================
// list
// ============================================================================

describe("list", () => {
  test("returns empty array when no installations exist", () => {
    const pm = initProject(tmpDir);
    expect(pm.list()).toEqual([]);
  });

  test("returns all installations sorted by connector then slug", async () => {
    const pm = initProject(tmpDir);

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
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), { secret: "data" });

    const list = pm.list();
    expect(list[0]).not.toHaveProperty("config");
  });
});

// ============================================================================
// delete
// ============================================================================

describe("delete", () => {
  test("removes an installation", async () => {
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    expect(pm.has(acme)).toBe(true);

    await pm.delete(acme);
    expect(pm.has(acme)).toBe(false);
  });

  test("removes credentials alongside installation", async () => {
    const pm = initProject(tmpDir);

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
    const pm = initProject(tmpDir);

    await pm.commit(pm.prepare(acme), {});
    await pm.delete(acme);

    const connectorDir = path.join(tmpDir, ".max", "installations", "acme");
    expect(fs.existsSync(connectorDir)).toBe(false);
  });

  test("throws for missing installation", () => {
    const pm = initProject(tmpDir);
    expect(pm.delete(acme)).rejects.toThrow("No installation found");
  });
});

// ============================================================================
// credentialStoreFor
// ============================================================================

describe("credentialStoreFor", () => {
  test("reads and writes credentials for a pending installation", async () => {
    const pm = initProject(tmpDir);

    const pending = pm.prepare(acme);
    const store = pm.credentialStoreFor(pending);

    await store.set("api_token", "sk-123");
    expect(await store.get("api_token")).toBe("sk-123");
    expect(await store.has("api_token")).toBe(true);
    expect(await store.keys()).toEqual(["api_token"]);
  });

  test("credentials persist across store instances", async () => {
    const pm = initProject(tmpDir);

    const pending = pm.prepare(acme);
    await pm.credentialStoreFor(pending).set("token", "val");

    expect(await pm.credentialStoreFor(pending).get("token")).toBe("val");
  });

  test("throws for missing credential key", async () => {
    const pm = initProject(tmpDir);

    const store = pm.credentialStoreFor(pm.prepare(acme));
    expect(store.get("nope")).rejects.toThrow('Credential "nope" not found');
  });

  test("scopes credentials per installation", async () => {
    const pm = initProject(tmpDir);

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
