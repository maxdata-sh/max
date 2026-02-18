import { describe, test, expect } from "bun:test"
import { EngineProxy } from "../proxies/engine-proxy.js"
import { EngineHandler } from "../proxies/engine-handler.js"
import { LoopbackTransport } from "../proxies/loopback-transport.js"
import { RpcResponse } from "../federation/rpc.js"
import { MaxError } from "../max-error.js"
import { LifecycleManager } from "../lifecycle.js"
import { Page } from "../pagination.js"
import { ErrUnknownMethod } from "../federation/rpc-errors.js"
import { BadInput } from "../errors/errors.js"
import type { Engine } from "../engine.js"
import type { InstallationScope } from "../scope.js"
import { AcmeProject, AcmeUser } from '@max/connector-acme'
import {EntityInput} from "../entity-input.js";
import {Fields} from "../fields-selector.js";
import {EntityResult} from "../entity-result.js";
import { Ref } from '../ref.js'

// -- Fake Engine --------------------------------------------------------------

const acmeUser1 = EntityResult.from(AcmeUser.ref("u1"), { displayName: "test" })


// FIXME: Whilst this test doesn't care at all about the data / fake engine, it's a little uncouth that we aren't just using a reasonable working test stub.
// Let's make one to have to hand.
function createFakeEngine() {
  const calls: { method: string; args: unknown[] }[] = []

  const engine: Engine<InstallationScope> = {
    lifecycle: LifecycleManager.on({}),

    async load(ref: any, fields: any) {
      calls.push({ method: "load", args: [ref, fields] })
      return acmeUser1
    },

    async loadField(ref: any, field: any) {
      calls.push({ method: "loadField", args: [ref, field] })
      return "field-value" as any
    },

    async loadCollection(ref: any, field: any, options: any) {
      calls.push({ method: "loadCollection", args: [ref, field, options] })
      return Page.empty()
    },

    async store(input: any) {
      calls.push({ method: "store", args: [input] })
      return acmeUser1.ref as Ref<any>
    },

    async loadPage(def: any, projection: any, page: any) {
      calls.push({ method: "loadPage", args: [def, projection, page] })
      return Page.empty() as Page<any>
    },

    async query(query: any) {
      calls.push({ method: "query", args: [query] })
      return Page.from([acmeUser1], false) as Page<any>
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
    const result = await proxy.load(AcmeUser.ref('u1'), "*")
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("load")
    expect(result.fields.displayName).toBe("test")
  })

  test("loadField round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadField(AcmeUser.ref('u1'), 'displayName')

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("loadField")
    expect(result).toBe("field-value")
  })

  test("loadCollection round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadCollection(AcmeProject.ref('u1'), 'tasks')
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("loadCollection")
    expect(result.items).toEqual([])
  })

  test("store round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.store(EntityInput.create(AcmeUser.ref("u1"), {}))
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("store")
    expect(result.entityType).toBe("AcmeUser")
  })

  test("loadPage round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.loadPage(AcmeUser, Fields.select('displayName'))
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("loadPage")
    expect(result.items).toEqual([])
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
