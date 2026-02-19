import { describe, test, expect } from "bun:test"
import { EngineProxy } from "../proxies/engine-proxy.js"
import { EngineHandler } from "../proxies/engine-handler.js"
import { LoopbackTransport } from "../proxies/loopback-transport.js"
import { RpcResponse } from "../federation/rpc.js"
import { MaxError } from "../max-error.js"
import { ErrUnknownMethod } from "../federation/rpc-errors.js"
import { BadInput } from "../errors/errors.js"
import { EntityInput } from "../entity-input.js"
import { Fields } from "../fields-selector.js"
import { AcmeProject, AcmeUser } from '@max/connector-acme'
import { StubbedEngine } from "@max/core/testing"
import type { InstallationScope } from "../scope.js"

// -- Helpers ------------------------------------------------------------------

function wireUp() {
  const calls: string[] = []
  const engine = StubbedEngine({ calls })
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
    const result = await proxy.load(AcmeUser.ref('u1'), "*")
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe("load")
    expect(result.ref.id).toBe("u1")
  })

  test("loadField round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadField(AcmeUser.ref('u1'), 'displayName')

    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe("loadField")
    expect(result).toBe("field-from-stub")
  })

  test("loadCollection round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadCollection(AcmeProject.ref('u1'), 'tasks')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe("loadCollection")
    expect(result.items).toEqual([])
  })

  test("store round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.store(EntityInput.create(AcmeUser.ref("u1"), {}))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe("store")
    expect(result.entityType).toBe("AcmeUser")
  })

  test("loadPage round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadPage(AcmeUser, Fields.select('displayName'))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe("loadPage")
    expect(result.items).toEqual([])
  })

  test("query round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.query({ def: { name: "User" }, filters: [] } as any)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe("query")
    expect(result.items).toHaveLength(1)
  })

  test("unknown method throws ErrUnknownMethod", async () => {
    const engine = StubbedEngine()
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
