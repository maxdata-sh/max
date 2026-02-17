import { describe, test, expect } from "bun:test"
import {
  HealthStatus,
  StartResult,
  StopResult,
  LifecycleManager,
  MaxError,
  ErrUnknownTarget,
  ErrUnknownMethod,
  NotFound,
  type RpcRequest,
  type Engine,
  type InstallationScope,
  type Schema,
} from "@max/core"
import type { SyncHandle, SyncId, SyncPlan, SyncResult, SyncStatus } from "@max/execution"
import type { InstallationClient } from "../protocols/installation-client.js"
import { InstallationDispatcher } from "../dispatchers/installation-dispatcher.js"

// -- Fake InstallationClient --------------------------------------------------

function createFakeInstallation(): {
  client: InstallationClient
  calls: string[]
} {
  const calls: string[] = []

  const fakeEngine: Engine<InstallationScope> = {
    lifecycle: LifecycleManager.on({}),
    async load() { calls.push("engine.load"); return { ref: {}, fields: {} } as any },
    async loadField() { calls.push("engine.loadField"); return "val" as any },
    async loadCollection() { calls.push("engine.loadCollection"); return { items: [], hasMore: false } as any },
    async store() { calls.push("engine.store"); return {} as any },
    async loadPage() { calls.push("engine.loadPage"); return { items: [], hasMore: false } as any },
    async query() { calls.push("engine.query"); return { items: [], hasMore: false } as any },
  }

  const fakeSyncHandle: SyncHandle = {
    id: "sync-1" as SyncId,
    plan: { steps: [] } as SyncPlan,
    startedAt: new Date("2026-01-01T00:00:00Z"),
    async status() { calls.push("sync.status"); return "running" as SyncStatus },
    async pause() { calls.push("sync.pause") },
    async cancel() { calls.push("sync.cancel") },
    async completion() { calls.push("sync.completion"); return { status: "completed", tasksCompleted: 1, tasksFailed: 0, duration: 100 } as SyncResult },
  }

  const client: InstallationClient = {
    async schema(){ return { entities: [], root: "Test" } as any as Schema },
    engine: fakeEngine,
    async sync() { calls.push("sync"); return fakeSyncHandle },
    async health() { calls.push("health"); return HealthStatus.healthy() },
    async start() { calls.push("start"); return StartResult.started() },
    async stop() { calls.push("stop"); return StopResult.stopped() },
  }

  return { client, calls }
}

// -- Helpers ------------------------------------------------------------------

function request(target: string, method: string, ...args: unknown[]): RpcRequest {
  return { id: crypto.randomUUID(), target, method, args }
}

// -- Tests --------------------------------------------------------------------

describe("InstallationDispatcher", () => {
  test("routes engine.query to engine handler", async () => {
    const { client, calls } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("engine", "query", { def: "User" }))
    expect(response.ok).toBe(true)
    expect(calls).toContain("engine.query")
  })

  test("routes engine.load to engine handler", async () => {
    const { client, calls } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("engine", "load", {}, "*"))
    expect(response.ok).toBe(true)
    expect(calls).toContain("engine.load")
  })

  test("routes root health to supervised handler", async () => {
    const { client, calls } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("", "health"))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toEqual({ status: "healthy" })
    expect(calls).toContain("health")
  })

  test("routes root schema", async () => {
    const { client } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("", "schema"))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toBeDefined()
  })

  test("sync returns handle data and subsequent operations work", async () => {
    const { client, calls } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    // Start sync
    const syncResponse = await dispatcher.dispatch(request("", "sync"))
    expect(syncResponse.ok).toBe(true)
    expect(calls).toContain("sync")

    const handleData = (syncResponse as any).result
    expect(handleData.id).toBe("sync-1")

    // Check status using sync ID
    const statusResponse = await dispatcher.dispatch(request("", "syncStatus", handleData.id))
    expect(statusResponse.ok).toBe(true)
    if (statusResponse.ok) expect(statusResponse.result).toBe("running")
    expect(calls).toContain("sync.status")

    // Complete sync
    const completionResponse = await dispatcher.dispatch(request("", "syncCompletion", handleData.id))
    expect(completionResponse.ok).toBe(true)
    expect(calls).toContain("sync.completion")
  })

  test("unknown target returns error response", async () => {
    const { client } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("nonexistent", "query"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe("rpc.unknown_target")
    }
  })

  test("unknown method returns error response", async () => {
    const { client } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("", "nonexistent"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe("rpc.unknown_method")
    }
  })

  test("error responses preserve MaxError structure", async () => {
    const { client } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("nonexistent", "query"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      const reconstituted = MaxError.reconstitute(response.error)
      expect(ErrUnknownTarget.is(reconstituted)).toBe(true)
    }
  })

  test("sync handle not found returns NotFound error", async () => {
    const { client } = createFakeInstallation()
    const dispatcher = new InstallationDispatcher(client)

    const response = await dispatcher.dispatch(request("", "syncStatus", "nonexistent-id"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      const reconstituted = MaxError.reconstitute(response.error)
      expect(MaxError.has(reconstituted, NotFound)).toBe(true)
    }
  })
})
