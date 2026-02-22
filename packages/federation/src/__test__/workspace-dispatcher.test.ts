import { describe, test, expect } from "bun:test"
import {
  MaxError,
  ErrNodeNotFound,
  NotFound,
  type RpcRequest,
  type InstallationId,
} from "@max/core"
import type { CreateInstallationConfig } from "../protocols/workspace-client.js"
import { WorkspaceDispatcher } from "../dispatchers/workspace-dispatcher.js"
import { StubbedWorkspaceClient } from "../testing.js"

// -- Helpers ------------------------------------------------------------------

function setup() {
  const calls: string[] = []
  const client = StubbedWorkspaceClient({ calls })
  const dispatcher = new WorkspaceDispatcher(client)
  return { dispatcher, calls }
}

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
    const { dispatcher, calls } = setup()

    const response = await dispatcher.dispatch(request("", "health"))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toEqual({ status: "healthy" })
    expect(calls).toContain("health")
  })

  test("routes listInstallations", async () => {
    const { dispatcher, calls } = setup()

    const response = await dispatcher.dispatch(request("", "listInstallations"))
    expect(response.ok).toBe(true)
    if (response.ok) {
      expect((response.result as any[]).length).toBe(2)
    }
    expect(calls).toContain("listInstallations")
  })

  test("routes createInstallation with config arg", async () => {
    const { dispatcher, calls } = setup()

    const config: CreateInstallationConfig = {
      via: 'deployer1',
      spec: { connector: "hubspot" as any },
      config: {strategy: 'strategy-1'}
    }
    const response = await dispatcher.dispatch(request("", "createInstallation", [config]))
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toBe("inst-new")
    expect(calls).toContain("createInstallation")
  })

  test("routes removeInstallation", async () => {
    const { dispatcher, calls } = setup()

    const response = await dispatcher.dispatch(request("", "removeInstallation", ["inst-1"]))
    expect(response.ok).toBe(true)
    expect(calls).toContain("removeInstallation(inst-1)")
  })

  test("routes to installation via scope.installationId", async () => {
    const { dispatcher } = setup()

    const response = await dispatcher.dispatch(
      request("engine", "query", [{ def: "User" }], { installationId: "inst-1" as InstallationId }),
    )
    expect(response.ok).toBe(true)
    if (response.ok) {
      expect((response.result as any).items[0].source).toBe("inst-1")
    }
  })

  test("scope routing strips installationId before forwarding", async () => {
    const { dispatcher } = setup()

    // Route to installation's root health
    const response = await dispatcher.dispatch(
      request("", "health", [], { installationId: "inst-1" as InstallationId }),
    )
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toEqual({ status: "healthy" })
  })

  test("scope routing with workspaceId preserves it", async () => {
    const { dispatcher } = setup()

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
    const { dispatcher } = setup()

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
    const { dispatcher } = setup()

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
