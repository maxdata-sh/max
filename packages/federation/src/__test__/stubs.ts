/**
 * Shared test stubs for federation protocols.
 *
 * These are dumb test doubles — they satisfy contracts with canned responses
 * so tests can verify routing, dispatching, and serialization. They are NOT
 * in-memory implementations that actually store/retrieve data.
 */

import {
  HealthStatus,
  StartResult,
  StopResult,
  LifecycleManager,
  type Engine,
  type InstallationScope,
  type InstallationId,
  type Schema,
  type Supervised,
} from "@max/core"
import type { SyncHandle, SyncId, SyncPlan, SyncResult, SyncStatus } from "@max/execution"
import type { InstallationClient, InstallationDescription } from "../protocols/installation-client.js"
import type { WorkspaceClient, CreateInstallationConfig, ConnectInstallationConfig } from "../protocols/workspace-client.js"
import type { InstallationInfo } from "../project-manager/types.js"

// -- Call tracking ------------------------------------------------------------

export interface CallTracker {
  readonly calls: string[]
}

function tracker(): CallTracker {
  return { calls: [] }
}

// -- StubbedSyncHandle --------------------------------------------------------

export interface StubbedSyncHandleOptions {
  readonly id?: string
  readonly tracker?: CallTracker
}

export function StubbedSyncHandle(options: StubbedSyncHandleOptions = {}): SyncHandle {
  const { id = "sync-1", tracker: t } = options
  return {
    id: id as SyncId,
    plan: { steps: [] } as SyncPlan,
    startedAt: new Date("2026-01-01T00:00:00Z"),
    async status() { t?.calls.push("sync.status"); return "running" as SyncStatus },
    async pause() { t?.calls.push("sync.pause") },
    async cancel() { t?.calls.push("sync.cancel") },
    async completion() {
      t?.calls.push("sync.completion")
      return { status: "completed", tasksCompleted: 1, tasksFailed: 0, duration: 100 } as SyncResult
    },
  }
}

// -- StubbedSupervised --------------------------------------------------------

export interface StubbedSupervisedOptions {
  readonly tracker?: CallTracker
}

export function StubbedSupervised(options: StubbedSupervisedOptions = {}): Supervised {
  const { tracker: t } = options
  return {
    async health() { t?.calls.push("health"); return HealthStatus.healthy() },
    async start() { t?.calls.push("start"); return StartResult.started() },
    async stop() { t?.calls.push("stop"); return StopResult.stopped() },
  }
}

// -- StubbedEngine ------------------------------------------------------------

export interface StubbedEngineOptions {
  /** Tag embedded in responses so tests can verify routing. */
  readonly id?: string
  readonly tracker?: CallTracker
}

export function StubbedEngine(options: StubbedEngineOptions = {}): Engine<InstallationScope> {
  const { id = "stub", tracker: t } = options
  return {
    lifecycle: LifecycleManager.on({}),
    async load(ref: any, fields: any) {
      t?.calls.push("engine.load")
      return { ref, fields: { name: `from-${id}` } } as any
    },
    async loadField() {
      t?.calls.push("engine.loadField")
      return `field-from-${id}` as any
    },
    async loadCollection() {
      t?.calls.push("engine.loadCollection")
      return { items: [], hasMore: false } as any
    },
    async store(input: any) {
      t?.calls.push("engine.store")
      return input.ref ?? {} as any
    },
    async loadPage() {
      t?.calls.push("engine.loadPage")
      return { items: [], hasMore: false } as any
    },
    async query(query: any) {
      t?.calls.push("engine.query")
      return { items: [{ source: id, query }], hasMore: false } as any
    },
  }
}

// -- StubbedInstallationClient ------------------------------------------------

export interface StubbedInstallationClientOptions {
  /** Tag embedded in responses so tests can verify routing. Defaults to "test". */
  readonly id?: string
  readonly tracker?: CallTracker
  readonly schema?: Schema
}

export function StubbedInstallationClient(
  options: StubbedInstallationClientOptions = {},
): InstallationClient {
  const { id = "test", tracker: t, schema: overrideSchema } = options
  const fakeSchema = overrideSchema ?? ({ entities: [], root: "Test" } as any as Schema)

  return {
    async describe(): Promise<InstallationDescription> {
      t?.calls.push("describe")
      return { connector: "test" as any, name: id, schema: fakeSchema }
    },
    async schema() { return fakeSchema },
    engine: StubbedEngine({ id, tracker: t }),
    async sync() {
      t?.calls.push("sync")
      return StubbedSyncHandle({ id: `sync-${id}`, tracker: t })
    },
    async health() { t?.calls.push("health"); return HealthStatus.healthy() },
    async start() { t?.calls.push("start"); return StartResult.started() },
    async stop() { t?.calls.push("stop"); return StopResult.stopped() },
  }
}

// -- StubbedWorkspaceClient ---------------------------------------------------

export interface StubbedWorkspaceClientOptions {
  readonly tracker?: CallTracker
  /** Pre-populated installations. Defaults to inst-1 (hubspot) + inst-2 (linear). */
  readonly installations?: Map<InstallationId, InstallationClient>
}

export function StubbedWorkspaceClient(
  options: StubbedWorkspaceClientOptions = {},
): WorkspaceClient {
  const { tracker: t } = options

  const installations = options.installations ?? (() => {
    const map = new Map<InstallationId, InstallationClient>()
    map.set("inst-1" as InstallationId, StubbedInstallationClient({ id: "inst-1" }))
    map.set("inst-2" as InstallationId, StubbedInstallationClient({ id: "inst-2" }))
    return map
  })()

  return {
    async listInstallations() {
      t?.calls.push("listInstallations")
      return [
        { id: "inst-1" as InstallationId, connector: "hubspot" as any, name: "hs", connectedAt: "2026-01-01", location: "1" },
        { id: "inst-2" as InstallationId, connector: "linear" as any, name: "lin", connectedAt: "2026-01-01", location: "2" },
      ] satisfies InstallationInfo[]
    },
    installation(id: InstallationId) {
      t?.calls.push(`installation(${id})`)
      return installations.get(id)
    },
    async createInstallation(config: CreateInstallationConfig) {
      t?.calls.push("createInstallation")
      return "inst-new" as InstallationId
    },
    async connectInstallation(config: ConnectInstallationConfig) {
      t?.calls.push("connectInstallation")
      return "inst-remote" as InstallationId
    },
    async removeInstallation(id: InstallationId) {
      t?.calls.push(`removeInstallation(${id})`)
    },
    async health() { t?.calls.push("health"); return HealthStatus.healthy() },
    async start() { t?.calls.push("start"); return StartResult.started() },
    async stop() { t?.calls.push("stop"); return StopResult.stopped() },
  }
}
