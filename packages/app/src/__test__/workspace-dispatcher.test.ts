import { describe, test, expect } from "bun:test"
import {
  HealthStatus,
  StartResult,
  StopResult,
  LifecycleManager,
  MaxError,
  ErrNodeNotFound,
  NotFound,
  type RpcRequest,
  type Engine,
  type InstallationScope,
  type InstallationId,
  type Schema,
} from "@max/core"
import type { SyncHandle, SyncId, SyncPlan, SyncResult, SyncStatus } from "@max/execution"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { WorkspaceClient, CreateInstallationConfig } from "../protocols/workspace-client.js"
import type { InstallationInfo } from "../project-manager/types.js"
import { WorkspaceDispatcher } from "../dispatchers/workspace-dispatcher.js"

// -- Fake InstallationClient --------------------------------------------------

function createFakeInstallation(id: InstallationId): InstallationClient {
  const fakeEngine: Engine<InstallationScope> = {
    lifecycle: LifecycleManager.on({}),
    async load() { return { ref: {}, fields: { name: "from-" + id } } as any },
    async loadField() { return "val" as any },
    async loadCollection() { return { items: [], hasMore: false } as any },
    async store() { return {} as any },
    async loadPage() { return { items: [], hasMore: false } as any },
    async query() { return { items: [{ source: id }], hasMore: false } as any },
  }

  return {
    schema: { entities: [], root: "Test" } as any as Schema,
    engine: fakeEngine,
    async sync() {
      return {
        id: `sync-${id}` as SyncId,
        plan: { steps: [] } as SyncPlan,
        startedAt: new Date("2026-01-01T00:00:00Z"),
        async status() { return "running" as SyncStatus },
        async pause() {},
        async cancel() {},
        async completion() { return { status: "completed", tasksCompleted: 1, tasksFailed: 0, duration: 100 } as SyncResult },
      } satisfies SyncHandle
    },
    async health() { return HealthStatus.healthy() },
    async start() { return StartResult.started() },
    async stop() { return StopResult.stopped() },
  }
}

// -- Fake WorkspaceClient -----------------------------------------------------

function createFakeWorkspace(): { client: WorkspaceClient; calls: string[] } {
  const calls: string[] = []
  const installations = new Map<InstallationId, InstallationClient>()
  installations.set("inst-1" as InstallationId, createFakeInstallation("inst-1" as InstallationId))
  installations.set("inst-2" as InstallationId, createFakeInstallation("inst-2" as InstallationId))

  const client: WorkspaceClient = {
    async listInstallations() {
      calls.push("listInstallations")
      return [
        { id: "inst-1" as InstallationId, connector: "hubspot" as any, name: "hs", connectedAt: "2026-01-01" },
        { id: "inst-2" as InstallationId, connector: "linear" as any, name: "lin", connectedAt: "2026-01-01" },
      ] satisfies InstallationInfo[]
    },
    installation(id: InstallationId) {
      calls.push(`installation(${id})`)
      return installations.get(id)
    },
    async createInstallation(config: CreateInstallationConfig) {
      calls.push("createInstallation")
      return "inst-new" as InstallationId
    },
    async removeInstallation(id: InstallationId) {
      calls.push(`removeInstallation(${id})`)
    },
    async health() { calls.push("health"); return HealthStatus.healthy() },
    async start() { calls.push("start"); return StartResult.started() },
    async stop() { calls.push("stop"); return StopResult.stopped() },
  }

  return { client, calls }
}

// -- Helpers ------------------------------------------------------------------

function request(
  target: string,
  method: string,
  args: unknown[] = [],
  scope?: RpcRequest["scope"],
): RpcRequest {
  return { id: crypto.randomUUID(), target, method, args, scope }
}

// -- Tests --------------------------------------------------------------------

describe("WorkspaceDispatcher", () => {
  test("routes health to supervised handler", async () => {
    const { client, calls } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    const response = await dispatcher.dispatch(request("", "health"))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toEqual({ status: "healthy" })
    expect(calls).toContain("health")
  })

  test("routes listInstallations", async () => {
    const { client, calls } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    const response = await dispatcher.dispatch(request("", "listInstallations"))
    expect(response.ok).toBe(true)
    if (response.ok) {
      expect((response.result as any[]).length).toBe(2)
    }
    expect(calls).toContain("listInstallations")
  })

  test("routes createInstallation with config arg", async () => {
    const { client, calls } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    const config: CreateInstallationConfig = { connector: "hubspot" as any }
    const response = await dispatcher.dispatch(request("", "createInstallation", [config]))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toBe("inst-new")
    expect(calls).toContain("createInstallation")
  })

  test("routes removeInstallation", async () => {
    const { client, calls } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    const response = await dispatcher.dispatch(request("", "removeInstallation", ["inst-1"]))
    expect(response.ok).toBe(true)
    expect(calls).toContain("removeInstallation(inst-1)")
  })

  test("routes to installation via scope.installationId", async () => {
    const { client } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    const response = await dispatcher.dispatch(
      request("engine", "query", [{ def: "User" }], { installationId: "inst-1" as InstallationId }),
    )
    expect(response.ok).toBe(true)
    if (response.ok) {
      expect((response.result as any).items[0].source).toBe("inst-1")
    }
  })

  test("scope routing strips installationId before forwarding", async () => {
    const { client } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    // Route to installation's root health
    const response = await dispatcher.dispatch(
      request("", "health", [], { installationId: "inst-1" as InstallationId }),
    )
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toEqual({ status: "healthy" })
  })

  test("scope routing with workspaceId preserves it", async () => {
    const { client } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    // workspaceId should be preserved when forwarding to installation
    const response = await dispatcher.dispatch(
      request("", "health", [], {
        workspaceId: "ws-1" as any,
        installationId: "inst-1" as InstallationId,
      }),
    )
    expect(response.ok).toBe(true)
  })

  test("scope routing to nonexistent installation returns NotFound error", async () => {
    const { client } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    const response = await dispatcher.dispatch(
      request("engine", "query", [], { installationId: "nonexistent" as InstallationId }),
    )
    expect(response.ok).toBe(false)
    if (!response.ok) {
      const reconstituted = MaxError.reconstitute(response.error)
      expect(ErrNodeNotFound.is(reconstituted)).toBe(true)
      expect(MaxError.has(reconstituted, NotFound)).toBe(true)
    }
  })

  test("sync through scoped installation", async () => {
    const { client } = createFakeWorkspace()
    const dispatcher = new WorkspaceDispatcher(client)

    // Start sync on inst-1
    const syncResponse = await dispatcher.dispatch(
      request("", "sync", [], { installationId: "inst-1" as InstallationId }),
    )
    expect(syncResponse.ok).toBe(true)
    if (syncResponse.ok) {
      expect((syncResponse.result as any).id).toBe("sync-inst-1")
    }
  })
})
