/**
 * Full RPC roundtrip tests.
 *
 * Tests the complete client proxy → dispatcher → handler → real impl chain
 * using loopback transports. No real sockets — just verifying that every
 * method survives the serialize→dispatch→deserialize cycle.
 */

import { describe, test, expect } from "bun:test"
import {
  HealthStatus,
  StartResult,
  StopResult,
  LifecycleManager,
  LoopbackTransport,
  LoopbackSerializedTransport,
  MaxError,
  NotFound,
  BadInput,
  type Engine,
  type InstallationScope,
  type InstallationId,
  type Schema,
  type Transport,
  RpcRequest,
  DispatchFn,
  RpcResponse,
} from '@max/core'
import type { SyncHandle, SyncId, SyncPlan, SyncResult, SyncStatus } from "@max/execution"
import type { InstallationClient, InstallationDescription } from "../protocols/installation-client.js"
import type { WorkspaceClient, CreateInstallationConfig, ConnectInstallationConfig } from "../protocols/workspace-client.js"
import type { InstallationInfo } from "../project-manager/types.js"
import { InstallationDispatcher } from "../dispatchers/installation-dispatcher.js"
import { WorkspaceDispatcher } from "../dispatchers/workspace-dispatcher.js"
import { InstallationClientProxy } from "../protocols/installation-client-proxy.js"
import { WorkspaceClientProxy } from "../protocols/workspace-client-proxy.js"

// -- Fake InstallationClient --------------------------------------------------

function createFakeInstallation(id: string): InstallationClient {
  const fakeSchema = { entities: [{ name: "Contact" }], root: "Contact" } as any as Schema

  const fakeEngine: Engine<InstallationScope> = {
    lifecycle: LifecycleManager.on({}),
    async load(ref: any, fields: any) {
      return { ref, fields: { name: `loaded-from-${id}` } } as any
    },
    async loadField() { return `field-from-${id}` as any },
    async loadCollection() { return { items: [], hasMore: false } as any },
    async store(input: any) { return input.ref ?? { entityType: "Contact", entityId: "c1" } },
    async loadPage() { return { items: [], hasMore: false } as any },
    async query(query: any) {
      return { items: [{ source: id, query }], hasMore: false } as any
    },
  }

  let syncHandle: SyncHandle | undefined

  return {
    async describe(): Promise<InstallationDescription> {
      return { connector: "test" as any, name: id, schema: fakeSchema }
    },
    async schema() { return fakeSchema },
    engine: fakeEngine,
    async sync() {
      syncHandle = {
        id: `sync-${id}` as SyncId,
        plan: { steps: [] } as SyncPlan,
        startedAt: new Date("2026-01-01T00:00:00Z"),
        async status() { return "running" as SyncStatus },
        async pause() {},
        async cancel() {},
        async completion() {
          return { status: "completed", tasksCompleted: 5, tasksFailed: 0, duration: 200 } as SyncResult
        },
      }
      return syncHandle
    },
    async health() { return HealthStatus.healthy() },
    async start() { return StartResult.started() },
    async stop() { return StopResult.stopped() },
  }
}

// -- Fake WorkspaceClient -----------------------------------------------------

function createFakeWorkspace(): WorkspaceClient {
  const installations = new Map<InstallationId, InstallationClient>()
  installations.set("inst-1" as InstallationId, createFakeInstallation("inst-1"))
  installations.set("inst-2" as InstallationId, createFakeInstallation("inst-2"))

  return {
    async listInstallations() {
      return [
        { id: "inst-1" as InstallationId, connector: "hubspot" as any, name: "hs", connectedAt: "2026-01-01", location: '1' },
        { id: "inst-2" as InstallationId, connector: "linear" as any, name: "lin", connectedAt: "2026-01-01", location: '2' },
      ] satisfies InstallationInfo[]
    },
    installation(id: InstallationId) {
      return installations.get(id)
    },
    async createInstallation(config: CreateInstallationConfig) {
      return 'inst-new'
    },
    async connectInstallation(config: ConnectInstallationConfig) {
      return 'inst-remote'
    },
    async removeInstallation(id: InstallationId) {},
    async health() { return HealthStatus.healthy() },
    async start() { return StartResult.started() },
    async stop() { return StopResult.stopped() },
  }
}



// -- Wiring helpers -----------------------------------------------------------

function wireInstallation(real: InstallationClient) {
  const dispatcher = new InstallationDispatcher(real)
  const transport = new LoopbackTransport((req) => dispatcher.dispatch(req))
  const proxy = new InstallationClientProxy(transport)
  return { proxy, dispatcher }
}

function wireWorkspace(real: WorkspaceClient) {
  const dispatcher = new WorkspaceDispatcher(real)
  const transport = new LoopbackSerializedTransport((req) => dispatcher.dispatch(req))
  const proxy = new WorkspaceClientProxy(transport)
  return { proxy, dispatcher }
}

// -- Installation roundtrip tests ---------------------------------------------

describe("Installation full roundtrip", () => {
  test("engine.query round-trips through proxy → dispatcher → handler", async () => {
    const real = createFakeInstallation("test")
    const { proxy } = wireInstallation(real)

    const result = await proxy.engine.query({ def: { name: "Contact" }, filters: [] } as any)
    expect(result.items).toHaveLength(1)
    expect((result.items[0] as any).source).toBe("test")
  })

  test("engine.load round-trips", async () => {
    const real = createFakeInstallation("test")
    const { proxy } = wireInstallation(real)

    const result = await proxy.engine.load({ entityType: "Contact", entityId: "c1" } as any, "*")
    expect((result as any).fields.name).toBe("loaded-from-test")
  })

  test("health round-trips", async () => {
    const real = createFakeInstallation("test")
    const { proxy } = wireInstallation(real)

    const result = await proxy.health()
    expect(result).toEqual({ status: "healthy" })
  })

  test("start/stop round-trips", async () => {
    const real = createFakeInstallation("test")
    const { proxy } = wireInstallation(real)

    const startResult = await proxy.start()
    expect(startResult).toEqual({ outcome: "started" })

    const stopResult = await proxy.stop()
    expect(stopResult).toEqual({ outcome: "stopped" })
  })

  test("schema round-trips", async () => {
    const real = createFakeInstallation("test")
    const { proxy } = wireInstallation(real)

    const schema = await proxy.schema()
    expect((schema as any).root).toBe("Contact")
  })

  test("sync → RemoteSyncHandle round-trips", async () => {
    const real = createFakeInstallation("test")
    const { proxy } = wireInstallation(real)

    const handle = await proxy.sync()
    expect(handle.id).toBe("sync-test")
    expect(handle.startedAt).toBeInstanceOf(Date)

    const status = await handle.status()
    expect(status).toBe("running")

    const result = await handle.completion()
    expect(result.status).toBe("completed")
    expect(result.tasksCompleted).toBe(5)
  })

  test("error propagation preserves MaxError facets", async () => {
    const real = createFakeInstallation("test")
    const dispatcher = new InstallationDispatcher(real)
    const transport = new LoopbackTransport((req) => dispatcher.dispatch(req))

    // Send a raw request with an unknown method to the engine target
    try {
      await transport.send({ id: "err-test", target: "engine", method: "nonexistent", args: [] })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(MaxError.isMaxError(err)).toBe(true)
      expect(MaxError.has(err, BadInput)).toBe(true)
    }
  })
})

// -- Workspace roundtrip tests ------------------------------------------------

describe("Workspace full roundtrip", () => {
  test("health round-trips", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const result = await proxy.health()
    expect(result).toEqual({ status: "healthy" })
  })

  test("listInstallations round-trips", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const installations = await proxy.listInstallations()
    expect(installations).toHaveLength(2)
    expect(installations[0].id).toBe("inst-1")
    expect(installations[1].connector).toBe("linear")
  })

  test("createInstallation round-trips", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const id = await proxy.createInstallation({ spec: { connector: "hubspot" as any } })
    expect(id).toBe("inst-new")
  })

  test("removeInstallation round-trips", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    // Should not throw
    await proxy.removeInstallation("inst-1" as InstallationId)
  })

  test("installation(id) routes through scoped transport", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const inst = proxy.installation("inst-1" as InstallationId)!
    const result = await inst.engine.query({ def: { name: "Contact" }, filters: [] } as any)
    expect(result.items).toHaveLength(1)
    expect((result.items[0] as any).source).toBe("inst-1")
  })

  test("installation(id) routes to correct installation", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const inst1 = proxy.installation("inst-1" as InstallationId)!
    const inst2 = proxy.installation("inst-2" as InstallationId)!

    const result1 = await inst1.engine.query({ def: { name: "Contact" } } as any)
    const result2 = await inst2.engine.query({ def: { name: "Contact" } } as any)

    expect((result1.items[0] as any).source).toBe("inst-1")
    expect((result2.items[0] as any).source).toBe("inst-2")
  })

  test("installation(id) sync round-trips through scope routing", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const inst = proxy.installation("inst-1" as InstallationId)!
    const handle = await inst.sync()

    expect(handle.id).toBe("sync-inst-1")
    const status = await handle.status()
    expect(status).toBe("running")
  })

  test("installation(id) health round-trips through scope routing", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const inst = proxy.installation("inst-1" as InstallationId)!
    const health = await inst.health()
    expect(health).toEqual({ status: "healthy" })
  })

  test("nonexistent installation returns NotFound error", async () => {
    const real = createFakeWorkspace()
    const { proxy } = wireWorkspace(real)

    const inst = proxy.installation("nonexistent" as InstallationId)!
    try {
      await inst.health()
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(MaxError.isMaxError(err)).toBe(true)
      expect(MaxError.has(err, NotFound)).toBe(true)
    }
  })
})
