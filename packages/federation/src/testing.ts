/**
 * @max/federation/testing — Test stubs for federation protocols.
 */

import {
  HealthStatus,
  StartResult,
  StopResult,
  type InstallationId,
  type Schema,
  Locator,
} from '@max/core'
import { StubbedEngine } from "@max/core/testing"
import type { SyncHandle, SyncId, SyncPlan, SyncResult, SyncStatus } from "@max/execution"
import type { InstallationClient, InstallationDescription } from "./protocols/installation-client.js"
import type { WorkspaceClient, CreateInstallationConfig, ConnectInstallationConfig } from "./protocols/workspace-client.js"
import type { InstallationInfo } from "./federation/installation-registry.js"

export { StubbedEngine, StubbedSupervised } from "@max/core/testing"

// -- StubbedSyncHandle --------------------------------------------------------

export interface StubbedSyncHandleOptions {
  readonly id?: string
  readonly calls?: string[]
}

export function StubbedSyncHandle(options: StubbedSyncHandleOptions = {}): SyncHandle {
  const { id = "sync-1", calls } = options
  return {
    id: id as SyncId,
    plan: { steps: [] } as SyncPlan,
    startedAt: new Date("2026-01-01T00:00:00Z"),
    async status() { calls?.push("status"); return "running" as SyncStatus },
    async pause() { calls?.push("pause") },
    async cancel() { calls?.push("cancel") },
    async completion() {
      calls?.push("completion")
      return { status: "completed", tasksCompleted: 1, tasksFailed: 0, duration: 100 } as SyncResult
    },
  }
}

// -- StubbedInstallationClient ------------------------------------------------

export interface StubbedInstallationClientOptions {
  /** Tag embedded in canned responses so tests can verify routing. Defaults to "test". */
  readonly id?: string
  /** Mutable array to record method calls into. Shared across engine, supervised, and sync. */
  readonly calls?: string[]
  readonly schema?: Schema
}

export function StubbedInstallationClient(
  options: StubbedInstallationClientOptions = {},
): InstallationClient {
  const { id = "test", calls, schema: overrideSchema } = options
  const fakeSchema = overrideSchema ?? ({ entities: [], root: "Test" } as any as Schema)

  return {
    async describe(): Promise<InstallationDescription> {
      calls?.push("describe")
      return { connector: "test" as any, name: id, schema: fakeSchema }
    },
    async schema() { return fakeSchema },
    engine: StubbedEngine({ id, calls }),
    async sync() {
      calls?.push("sync")
      return StubbedSyncHandle({ id: `sync-${id}`, calls })
    },
    async health() { calls?.push("health"); return HealthStatus.healthy() },
    async start() { calls?.push("start"); return StartResult.started() },
    async stop() { calls?.push("stop"); return StopResult.stopped() },
  }
}

// -- StubbedWorkspaceClient ---------------------------------------------------

export interface StubbedWorkspaceClientOptions {
  /** Mutable array to record method calls into. */
  readonly calls?: string[]
  /** Pre-populated installations. Defaults to inst-1 (hubspot) + inst-2 (linear). */
  readonly installations?: Map<InstallationId, InstallationClient>
}

export function StubbedWorkspaceClient(
  options: StubbedWorkspaceClientOptions = {},
): WorkspaceClient {
  const { calls } = options

  const installations = options.installations ?? (() => {
    const map = new Map<InstallationId, InstallationClient>()
    map.set("inst-1" as InstallationId, StubbedInstallationClient({ id: "inst-1" }))
    map.set("inst-2" as InstallationId, StubbedInstallationClient({ id: "inst-2" }))
    return map
  })()

  return {
    async listInstallations() {
      calls?.push("listInstallations")
      return [
        {
          id: 'inst-1' as InstallationId,
          connector: 'hubspot' as any,
          name: 'hs',
          connectedAt: '2026-01-01',
          locator: 'max://-/1',
        },
        {
          id: 'inst-2' as InstallationId,
          connector: 'linear' as any,
          name: 'lin',
          connectedAt: '2026-01-01',
          locator: 'max://-/2',
        },
      ] satisfies InstallationInfo[]
    },
    installation(id: InstallationId) {
      calls?.push(`installation(${id})`)
      return installations.get(id)!
    },
    async createInstallation(config: CreateInstallationConfig) {
      calls?.push("createInstallation")
      return "inst-new" as InstallationId
    },
    async connectInstallation(id: InstallationId) {
      calls?.push("connectInstallation")
      return "inst-remote" as InstallationId
    },
    async removeInstallation(id: InstallationId) {
      calls?.push(`removeInstallation(${id})`)
    },
    async listConnectors() {
      calls?.push("listConnectors")
      return [{ name: "hubspot" }, { name: "linear" }] as any
    },
    async connectorSchema(connector: string) {
      calls?.push(`connectorSchema(${connector})`)
      return { entities: [], root: connector } as any
    },
    async connectorOnboarding(connector: string) {
      calls?.push(`connectorOnboarding(${connector})`)
      return { steps: [] } as any
    },
    async health() { calls?.push("health"); return HealthStatus.healthy() },
    async start() { calls?.push("start"); return StartResult.started() },
    async stop() { calls?.push("stop"); return StopResult.stopped() },
  }
}
