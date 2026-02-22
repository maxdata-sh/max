/**
 * Full RPC roundtrip tests.
 *
 * Tests the complete client proxy → dispatcher → handler → real impl chain
 * using loopback transports. No real sockets — just verifying that every
 * method survives the serialize→dispatch→deserialize cycle.
 */

import { describe, expect, test } from 'bun:test'
import {
  BadInput,
  type InstallationId,
  LoopbackSerializedTransport,
  LoopbackTransport,
  MaxError,
  NotFound,
} from '@max/core'
import { InstallationDispatcher } from '../dispatchers/installation-dispatcher.js'
import { WorkspaceDispatcher } from '../dispatchers/workspace-dispatcher.js'
import { InstallationClientProxy } from '../protocols/installation-client-proxy.js'
import { WorkspaceClientProxy } from '../protocols/workspace-client-proxy.js'
import { StubbedInstallationClient, StubbedWorkspaceClient } from '../testing.js'

// -- Wiring helpers -----------------------------------------------------------

function wireInstallation(id: string = "test") {
  const real = StubbedInstallationClient({ id })
  const dispatcher = new InstallationDispatcher(real)
  const transport = new LoopbackTransport((req) => dispatcher.dispatch(req))
  const proxy = new InstallationClientProxy(transport)
  return { proxy, dispatcher, real }
}

function wireWorkspace() {
  const real = StubbedWorkspaceClient()
  const dispatcher = new WorkspaceDispatcher(real)
  const transport = new LoopbackSerializedTransport((req) => dispatcher.dispatch(req))
  const proxy = new WorkspaceClientProxy(transport)
  return { proxy, dispatcher }
}

// -- Installation roundtrip tests ---------------------------------------------

describe("Installation full roundtrip", () => {
  test("engine.query round-trips through proxy → dispatcher → handler", async () => {
    const { proxy } = wireInstallation("test")

    const result = await proxy.engine.query({ def: { name: "Contact" }, filters: [] } as any)
    expect(result.items).toHaveLength(1)
    expect((result.items[0] as any).source).toBe("test")
  })

  test("engine.load round-trips", async () => {
    const { proxy } = wireInstallation("test")

    const result = await proxy.engine.load({ entityType: "Contact", entityId: "c1" } as any, "*")
    expect((result as any).fields.name).toBe("from-test")
  })

  test("health round-trips", async () => {
    const { proxy } = wireInstallation()

    const result = await proxy.health()
    expect(result).toEqual({ status: "healthy" })
  })

  test("start/stop round-trips", async () => {
    const { proxy } = wireInstallation()

    const startResult = await proxy.start()
    expect(startResult).toEqual({ outcome: "started" })

    const stopResult = await proxy.stop()
    expect(stopResult).toEqual({ outcome: "stopped" })
  })

  test("schema round-trips", async () => {
    const { proxy } = wireInstallation()

    const schema = await proxy.schema()
    expect((schema as any).root).toBe("Test")
  })

  test("sync → RemoteSyncHandle round-trips", async () => {
    const { proxy } = wireInstallation("test")

    const handle = await proxy.sync()
    expect(handle.id).toBe("sync-test")
    expect(handle.startedAt).toBeInstanceOf(Date)

    const status = await handle.status()
    expect(status).toBe("running")

    const result = await handle.completion()
    expect(result.status).toBe("completed")
    expect(result.tasksCompleted).toBe(1)
  })

  test("error propagation preserves MaxError facets", async () => {
    const real = StubbedInstallationClient()
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
    const { proxy } = wireWorkspace()

    const result = await proxy.health()
    expect(result).toEqual({ status: "healthy" })
  })

  test("listInstallations round-trips", async () => {
    const { proxy } = wireWorkspace()

    const installations = await proxy.listInstallations()
    expect(installations).toHaveLength(2)
    expect(installations[0].id).toBe("inst-1")
    expect(installations[1].connector).toBe("linear")
  })

  test("createInstallation round-trips", async () => {
    const { proxy } = wireWorkspace()

    const id = await proxy.createInstallation({
      via: 'some-deployer',
      spec: { connector: "hubspot" as any},
      config: { strategy: 'strategy1' }
    })
    expect(id).toBe("inst-new")
  })

  test("removeInstallation round-trips", async () => {
    const { proxy } = wireWorkspace()

    // Should not throw
    await proxy.removeInstallation("inst-1" as InstallationId)
  })

  test("installation(id) routes through scoped transport", async () => {
    const { proxy } = wireWorkspace()

    const inst = proxy.installation("inst-1" as InstallationId)!
    const result = await inst.engine.query({ def: { name: "Contact" }, filters: [] } as any)
    expect(result.items).toHaveLength(1)
    expect((result.items[0] as any).source).toBe("inst-1")
  })

  test("installation(id) routes to correct installation", async () => {
    const { proxy } = wireWorkspace()

    const inst1 = proxy.installation("inst-1" as InstallationId)!
    const inst2 = proxy.installation("inst-2" as InstallationId)!

    const result1 = await inst1.engine.query({ def: { name: "Contact" } } as any)
    const result2 = await inst2.engine.query({ def: { name: "Contact" } } as any)

    expect((result1.items[0] as any).source).toBe("inst-1")
    expect((result2.items[0] as any).source).toBe("inst-2")
  })

  test("installation(id) sync round-trips through scope routing", async () => {
    const { proxy } = wireWorkspace()

    const inst = proxy.installation("inst-1" as InstallationId)!
    const handle = await inst.sync()

    expect(handle.id).toBe("sync-inst-1")
    const status = await handle.status()
    expect(status).toBe("running")
  })

  test("installation(id) health round-trips through scope routing", async () => {
    const { proxy } = wireWorkspace()

    const inst = proxy.installation("inst-1" as InstallationId)!
    const health = await inst.health()
    expect(health).toEqual({ status: "healthy" })
  })

  test("nonexistent installation returns NotFound error", async () => {
    const { proxy } = wireWorkspace()

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
