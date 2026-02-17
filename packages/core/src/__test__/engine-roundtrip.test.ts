import { describe, test, expect } from "bun:test"
import { EngineProxy } from "../proxies/engine-proxy.js"
import { EngineHandler } from "../proxies/engine-handler.js"
import { LoopbackTransport } from "../proxies/loopback-transport.js"
import { RpcResponse } from "../federation/rpc.js"
import { MaxError } from "../max-error.js"
import { LifecycleManager } from "../lifecycle.js"
import { ErrUnknownMethod } from "../federation/rpc-errors.js"
import { BadInput } from "../errors/errors.js"
import type { Engine } from "../engine.js"
import type { InstallationScope } from "../scope.js"

// -- Fake Engine --------------------------------------------------------------

function createFakeEngine() {
  const calls: { method: string; args: unknown[] }[] = []

  const engine: Engine<InstallationScope> = {
    lifecycle: LifecycleManager.on({}),

    async load(ref: any, fields: any) {
      calls.push({ method: "load", args: [ref, fields] })
      return { ref, fields: { name: "test" } }
    },

    async loadField(ref: any, field: any) {
      calls.push({ method: "loadField", args: [ref, field] })
      return "field-value"
    },

    async loadCollection(ref: any, field: any, options: any) {
      calls.push({ method: "loadCollection", args: [ref, field, options] })
      return { items: [], hasMore: false }
    },

    async store(input: any) {
      calls.push({ method: "store", args: [input] })
      return { entityType: "User", entityId: "u1" }
    },

    async loadPage(def: any, projection: any, page: any) {
      calls.push({ method: "loadPage", args: [def, projection, page] })
      return { items: [], hasMore: false }
    },

    async query(query: any) {
      calls.push({ method: "query", args: [query] })
      return { items: [{ ref: "test-ref", fields: {} }], hasMore: false }
    },
  }

  return { engine, calls }
}

// -- Helpers ------------------------------------------------------------------

function wireUp() {
  const { engine, calls } = createFakeEngine()
  const handler = new EngineHandler(engine)

  const transport = new LoopbackTransport(async (request) => {
    try {
      const result = await handler.dispatch(request.method, request.args)
      return RpcResponse.ok(request.id, result)
    } catch (err) {
      return RpcResponse.error(request.id, MaxError.serialize(err))
    }
  })

  const proxy = new EngineProxy<InstallationScope>(transport)

  return { proxy, calls }
}

// -- Tests --------------------------------------------------------------------

describe("Engine proxy+handler roundtrip", () => {
  test("load round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.load({ entityType: "User", entityId: "u1" } as any, "*")
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("load")
    expect(result).toEqual({ ref: { entityType: "User", entityId: "u1" }, fields: { name: "test" } })
  })

  test("loadField round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadField({ entityType: "User", entityId: "u1" } as any, "name" as any)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("loadField")
    expect(result).toBe("field-value")
  })

  test("loadCollection round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadCollection({ entityType: "User", entityId: "u1" } as any, "contacts" as any)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("loadCollection")
    expect(result).toEqual({ items: [], hasMore: false })
  })

  test("store round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.store({ ref: { entityType: "User", entityId: "u1" }, fields: {} } as any)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("store")
    expect(result).toEqual({ entityType: "User", entityId: "u1" })
  })

  test("loadPage round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadPage({ name: "User" } as any, { kind: "refs" } as any)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("loadPage")
    expect(result).toEqual({ items: [], hasMore: false })
  })

  test("query round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.query({ def: { name: "User" }, filters: [] } as any)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("query")
    expect(result.items).toHaveLength(1)
  })

  test("unknown method throws ErrUnknownMethod", async () => {
    const { engine } = createFakeEngine()
    const handler = new EngineHandler(engine)

    try {
      await handler.dispatch("nonexistent", [])
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(ErrUnknownMethod.is(err)).toBe(true)
      expect(MaxError.has(err, BadInput)).toBe(true)
    }
  })
})
