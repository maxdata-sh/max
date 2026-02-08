import { Server } from "bun";
import type { Tenant } from "./tenant.ts";

import DASHBOARD_HTML from "./dashboard.html" with { type: "text" };

export function startServer(
  tenant: Tenant,
  opts?: { port?: number; hostname?: string },
): { server: Server<undefined>; url: string; stop: () => void } {
  const server = Bun.serve({
    port: opts?.port ?? 0,
    hostname: opts?.hostname ?? "localhost",
    fetch: (req) => handleRequest(tenant, req),
  });
  const url = `http://${server.hostname}:${server.port}`;
  return { server, url, stop: () => server.stop() };
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

async function handleRequest(tenant: Tenant, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Dashboard
  if (path === "/" || path === "/dashboard") {
    return serveDashboard();
  }

  // Public endpoints (no auth)
  if (path === "/api/health") {
    return json({ status: "ok", tenant: tenant.name });
  }
  if (path === "/api/meta") {
    return json({ tenant: tenant.name, apiKey: tenant.getApiKey() });
  }

  // Auth check for all other /api/ routes
  if (path.startsWith("/api/")) {
    const authErr = checkAuth(tenant, req);
    if (authErr) return authErr;
  }

  try {
    return await route(tenant, method, path, url, req);
  } catch (err: any) {
    if (err.message?.includes("not found")) return json({ error: err.message }, 404);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
}

function checkAuth(tenant: Tenant, req: Request): Response | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return json({ error: "Missing API key" }, 401);
  }
  if (!tenant.validateApiKey(header.slice(7))) {
    return json({ error: "Invalid API key" }, 403);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function route(
  tenant: Tenant,
  method: string,
  path: string,
  url: URL,
  req: Request,
): Promise<Response> {
  // --- Changes (sync) ---
  if (method === "GET" && path === "/api/changes") {
    const since = intParam(url, "since") ?? undefined;
    const limit = intParam(url, "limit") ?? undefined;
    return json(tenant.getChanges(since, limit));
  }
  if (method === "GET" && path === "/api/changes/recent") {
    const limit = intParam(url, "limit") ?? undefined;
    return json(tenant.getRecentChanges(limit));
  }

  // --- Workspaces ---
  if (method === "GET" && path === "/api/workspaces") return json(tenant.listWorkspaces());
  if (method === "POST" && path === "/api/workspaces") return json(tenant.createWorkspace(await body(req)), 201);
  if (method === "GET" && matchId(path, "/api/workspaces/")) {
    const id = extractId(path, "/api/workspaces/");
    const ws = tenant.getWorkspace(id);
    return ws ? json(ws) : json({ error: "Not found" }, 404);
  }
  if (method === "PATCH" && matchId(path, "/api/workspaces/")) {
    return json(tenant.updateWorkspace(extractId(path, "/api/workspaces/"), await body(req)));
  }
  if (method === "DELETE" && matchId(path, "/api/workspaces/")) {
    tenant.deleteWorkspace(extractId(path, "/api/workspaces/"));
    return json({ ok: true });
  }

  // --- Users ---
  if (method === "GET" && path === "/api/users") {
    return json(tenant.listUsers(url.searchParams.get("workspaceId") ?? undefined));
  }
  if (method === "POST" && path === "/api/users") return json(tenant.createUser(await body(req)), 201);
  if (method === "GET" && matchId(path, "/api/users/")) {
    const u = tenant.getUser(extractId(path, "/api/users/"));
    return u ? json(u) : json({ error: "Not found" }, 404);
  }
  if (method === "PATCH" && matchId(path, "/api/users/")) {
    return json(tenant.updateUser(extractId(path, "/api/users/"), await body(req)));
  }
  if (method === "DELETE" && matchId(path, "/api/users/")) {
    tenant.deleteUser(extractId(path, "/api/users/"));
    return json({ ok: true });
  }

  // --- Projects ---
  if (method === "GET" && path === "/api/projects") {
    return json(tenant.listProjects(url.searchParams.get("workspaceId") ?? undefined));
  }
  if (method === "POST" && path === "/api/projects") return json(tenant.createProject(await body(req)), 201);
  if (method === "GET" && matchId(path, "/api/projects/")) {
    const p = tenant.getProject(extractId(path, "/api/projects/"));
    return p ? json(p) : json({ error: "Not found" }, 404);
  }
  if (method === "PATCH" && matchId(path, "/api/projects/")) {
    return json(tenant.updateProject(extractId(path, "/api/projects/"), await body(req)));
  }
  if (method === "DELETE" && matchId(path, "/api/projects/")) {
    tenant.deleteProject(extractId(path, "/api/projects/"));
    return json({ ok: true });
  }

  // --- Tasks ---
  if (method === "GET" && path === "/api/tasks") {
    return json(tenant.listTasks(url.searchParams.get("projectId") ?? undefined));
  }
  if (method === "POST" && path === "/api/tasks") return json(tenant.createTask(await body(req)), 201);
  // Task history must match before generic task get
  if (method === "GET" && path.match(/^\/api\/tasks\/[^/]+\/history$/)) {
    const taskId = path.split("/")[3];
    return json(tenant.getTaskHistory(taskId, {
      before: intParam(url, "before") ?? undefined,
      limit: intParam(url, "limit") ?? undefined,
    }));
  }
  if (method === "GET" && matchId(path, "/api/tasks/")) {
    const t = tenant.getTask(extractId(path, "/api/tasks/"));
    return t ? json(t) : json({ error: "Not found" }, 404);
  }
  if (method === "PATCH" && matchId(path, "/api/tasks/")) {
    return json(tenant.updateTask(extractId(path, "/api/tasks/"), await body(req)));
  }
  if (method === "DELETE" && matchId(path, "/api/tasks/")) {
    tenant.deleteTask(extractId(path, "/api/tasks/"));
    return json({ ok: true });
  }

  // --- Files ---
  if (method === "GET" && path === "/api/files") {
    return json(tenant.listFiles(url.searchParams.get("projectId") ?? undefined));
  }
  if (method === "POST" && path === "/api/files") return json(tenant.createFile(await body(req)), 201);
  if (method === "GET" && matchId(path, "/api/files/")) {
    const f = tenant.getFile(extractId(path, "/api/files/"));
    return f ? json(f) : json({ error: "Not found" }, 404);
  }
  if (method === "PATCH" && matchId(path, "/api/files/")) {
    return json(tenant.updateFile(extractId(path, "/api/files/"), await body(req)));
  }
  if (method === "DELETE" && matchId(path, "/api/files/")) {
    tenant.deleteFile(extractId(path, "/api/files/"));
    return json({ ok: true });
  }

  // --- Webhooks ---
  if (method === "GET" && path === "/api/webhooks") return json(tenant.listWebhooks());
  if (method === "POST" && path === "/api/webhooks") {
    const { url: whUrl } = await body(req);
    return json(tenant.registerWebhook(whUrl), 201);
  }
  if (method === "DELETE" && matchId(path, "/api/webhooks/")) {
    tenant.unregisterWebhook(extractId(path, "/api/webhooks/"));
    return json({ ok: true });
  }

  // --- Seeding / Generation ---
  if (method === "POST" && path === "/api/seed") {
    const opts = await body(req).catch(() => ({}));
    return json(await tenant.seed(opts));
  }
  if (method === "POST" && path === "/api/generate/start") {
    const opts = await body(req).catch(() => ({}));
    tenant.startContinuousGeneration(opts);
    return json({ ok: true });
  }
  if (method === "POST" && path === "/api/generate/stop") {
    tenant.stopContinuousGeneration();
    return json({ ok: true });
  }

  // --- Stats ---
  if (method === "GET" && path === "/api/stats") return json(tenant.getStats());

  return json({ error: "Not found" }, 404);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function body(req: Request): Promise<any> {
  return req.json();
}

function intParam(url: URL, name: string): number | null {
  const v = url.searchParams.get(name);
  return v ? parseInt(v, 10) : null;
}

function matchId(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && path.split("/").length === prefix.split("/").length;
}

function extractId(path: string, prefix: string): string {
  return path.slice(prefix.length);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function serveDashboard(): Response {
  return new Response(String(DASHBOARD_HTML), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
