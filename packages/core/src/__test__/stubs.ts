/**
 * Shared test stubs for core protocols.
 *
 * These are dumb test doubles — canned responses and call tracking.
 * See also: @max/federation's __test__/stubs.ts for higher-level stubs
 * (InstallationClient, WorkspaceClient) that compose these.
 */

import { LifecycleManager } from "../lifecycle.js"
import { Page } from "../pagination.js"
import { HealthStatus, StartResult, StopResult } from "../federation/supervised.js"
import type { Engine } from "../engine.js"
import type { InstallationScope } from "../scope.js"
import type { Supervised } from "../federation/supervised.js"
import type { Ref } from "../ref.js"
import type { EntityResult } from "../entity-result.js"

// -- Call tracking ------------------------------------------------------------

export interface EngineCall {
  readonly method: string
  readonly args: unknown[]
}

// -- StubbedSupervised --------------------------------------------------------

export function StubbedSupervised(): { supervised: Supervised; calls: string[] } {
  const calls: string[] = []
  const supervised: Supervised = {
    async health() { calls.push("health"); return HealthStatus.healthy() },
    async start() { calls.push("start"); return StartResult.started() },
    async stop() { calls.push("stop"); return StopResult.stopped() },
  }
  return { supervised, calls }
}

// -- StubbedEngine ------------------------------------------------------------

export interface StubbedEngineOptions {
  /** Entity result returned by load and query. When provided, query returns a page containing it. */
  readonly defaultResult?: EntityResult<any, any>
}

export function StubbedEngine(
  options: StubbedEngineOptions = {},
): { engine: Engine<InstallationScope>; calls: EngineCall[] } {
  const calls: EngineCall[] = []
  const { defaultResult } = options

  const engine: Engine<InstallationScope> = {
    lifecycle: LifecycleManager.on({}),

    async load(ref: any, fields: any) {
      calls.push({ method: "load", args: [ref, fields] })
      return defaultResult ?? ({ ref, fields: {} } as any)
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
      return (defaultResult?.ref ?? {}) as Ref<any>
    },

    async loadPage(def: any, projection: any, page: any) {
      calls.push({ method: "loadPage", args: [def, projection, page] })
      return Page.empty() as Page<any>
    },

    async query(query: any) {
      calls.push({ method: "query", args: [query] })
      return defaultResult
        ? (Page.from([defaultResult], false) as Page<any>)
        : (Page.empty() as Page<any>)
    },
  }

  return { engine, calls }
}
