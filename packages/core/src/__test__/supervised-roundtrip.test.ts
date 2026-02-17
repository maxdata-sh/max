import { describe, test, expect } from "bun:test"
import { SupervisedProxy } from "../proxies/supervised-proxy.js"
import { SupervisedHandler } from "../proxies/supervised-handler.js"
import { LoopbackTransport } from "../proxies/loopback-transport.js"
import { RpcResponse } from "../federation/rpc.js"
import { MaxError } from "../max-error.js"
import { HealthStatus, StartResult, StopResult } from "../federation/supervised.js"
import { ErrUnknownMethod } from "../federation/rpc-errors.js"
import type { Supervised } from "../federation/supervised.js"

// -- Fake Supervised ----------------------------------------------------------

function createFakeSupervised(): { supervised: Supervised; calls: string[] } {
  const calls: string[] = []

  const supervised: Supervised = {
    async health() {
      calls.push("health")
      return HealthStatus.healthy()
    },
    async start() {
      calls.push("start")
      return StartResult.started()
    },
    async stop() {
      calls.push("stop")
      return StopResult.stopped()
    },
  }

  return { supervised, calls }
}

// -- Helpers ------------------------------------------------------------------

function wireUp() {
  const { supervised, calls } = createFakeSupervised()
  const handler = new SupervisedHandler(supervised)

  const transport = new LoopbackTransport(async (request) => {
    try {
      const result = await handler.dispatch(request.method, request.args)
      return RpcResponse.ok(request.id, result)
    } catch (err) {
      return RpcResponse.error(request.id, MaxError.serialize(err))
    }
  })

  const proxy = new SupervisedProxy(transport)

  return { proxy, calls }
}

// -- Tests --------------------------------------------------------------------

describe("Supervised proxy+handler roundtrip", () => {
  test("health round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.health()
    expect(calls).toEqual(["health"])
    expect(result).toEqual({ status: "healthy" })
  })

  test("start round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.start()
    expect(calls).toEqual(["start"])
    expect(result).toEqual({ outcome: "started" })
  })

  test("stop round-trips", async () => {
    const { proxy, calls } = wireUp()
    const result = await proxy.stop()
    expect(calls).toEqual(["stop"])
    expect(result).toEqual({ outcome: "stopped" })
  })

  test("unknown method throws ErrUnknownMethod", async () => {
    const { supervised } = createFakeSupervised()
    const handler = new SupervisedHandler(supervised)

    try {
      await handler.dispatch("nonexistent", [])
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(ErrUnknownMethod.is(err)).toBe(true)
    }
  })
})
