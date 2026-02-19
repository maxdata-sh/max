import { describe, test, expect } from "bun:test"
import {
  MaxError,
  ErrUnknownTarget,
  ErrUnknownMethod,
  NotFound,
  type RpcRequest,
} from "@max/core"
import { InstallationDispatcher } from "../dispatchers/installation-dispatcher.js"
import { StubbedInstallationClient, type CallTracker } from "./stubs.js"

// -- Helpers ------------------------------------------------------------------

function setup(): { dispatcher: InstallationDispatcher; calls: CallTracker } {
  const calls: CallTracker = { calls: [] }
  const client = StubbedInstallationClient({ tracker: calls })
  const dispatcher = new InstallationDispatcher(client)
  return { dispatcher, calls }
}

function request(target: string, method: string, ...args: unknown[]): RpcRequest {
  return { id: crypto.randomUUID(), target, method, args }
}

// -- Tests --------------------------------------------------------------------

describe("InstallationDispatcher", () => {
  test("routes engine.query to engine handler", async () => {
    const { dispatcher, calls } = setup()

    const response = await dispatcher.dispatch(request("engine", "query", { def: "User" }))
    expect(response.ok).toBe(true)
    expect(calls.calls).toContain("engine.query")
  })

  test("routes engine.load to engine handler", async () => {
    const { dispatcher, calls } = setup()

    const response = await dispatcher.dispatch(request("engine", "load", {}, "*"))
    expect(response.ok).toBe(true)
    expect(calls.calls).toContain("engine.load")
  })

  test("routes root health to supervised handler", async () => {
    const { dispatcher, calls } = setup()

    const response = await dispatcher.dispatch(request("", "health"))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toEqual({ status: "healthy" })
    expect(calls.calls).toContain("health")
  })

  test("routes root schema", async () => {
    const { dispatcher } = setup()

    const response = await dispatcher.dispatch(request("", "schema"))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toBeDefined()
  })

  test("sync returns handle data and subsequent operations work", async () => {
    const { dispatcher, calls } = setup()

    // Start sync
    const syncResponse = await dispatcher.dispatch(request("", "sync"))
    expect(syncResponse.ok).toBe(true)
    expect(calls.calls).toContain("sync")

    const handleData = (syncResponse as any).result
    expect(handleData.id).toBe("sync-test")

    // Check status using sync ID
    const statusResponse = await dispatcher.dispatch(request("", "syncStatus", handleData.id))
    expect(statusResponse.ok).toBe(true)
    if (statusResponse.ok) expect(statusResponse.result).toBe("running")
    expect(calls.calls).toContain("sync.status")

    // Complete sync
    const completionResponse = await dispatcher.dispatch(request("", "syncCompletion", handleData.id))
    expect(completionResponse.ok).toBe(true)
    expect(calls.calls).toContain("sync.completion")
  })

  test("unknown target returns error response", async () => {
    const { dispatcher } = setup()

    const response = await dispatcher.dispatch(request("nonexistent", "query"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe("rpc.unknown_target")
    }
  })

  test("unknown method returns error response", async () => {
    const { dispatcher } = setup()

    const response = await dispatcher.dispatch(request("", "nonexistent"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe("rpc.unknown_method")
    }
  })

  test("error responses preserve MaxError structure", async () => {
    const { dispatcher } = setup()

    const response = await dispatcher.dispatch(request("nonexistent", "query"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      const reconstituted = MaxError.reconstitute(response.error)
      expect(ErrUnknownTarget.is(reconstituted)).toBe(true)
    }
  })

  test("sync handle not found returns NotFound error", async () => {
    const { dispatcher } = setup()

    const response = await dispatcher.dispatch(request("", "syncStatus", "nonexistent-id"))
    expect(response.ok).toBe(false)
    if (!response.ok) {
      const reconstituted = MaxError.reconstitute(response.error)
      expect(MaxError.has(reconstituted, NotFound)).toBe(true)
    }
  })
})
