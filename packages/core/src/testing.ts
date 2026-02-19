/**
 * @max/core/testing — Test stubs for core protocols.
 *
 */

import { LifecycleManager } from "./lifecycle.js"
import { Page } from "./pagination.js"
import { HealthStatus, StartResult, StopResult } from "./federation/supervised.js"
import type { Engine } from "./engine.js"
import type { InstallationScope } from "./scope.js"
import type { Supervised } from "./federation/supervised.js"
import type { Ref } from "./ref.js"

// -- StubbedSupervised --------------------------------------------------------

export interface StubbedSupervisedOptions {
  /** Mutable array to record method calls into. */
  readonly calls?: string[]
}

export function StubbedSupervised(options: StubbedSupervisedOptions = {}): Supervised {
  const { calls } = options
  return {
    async health() { calls?.push("health"); return HealthStatus.healthy() },
    async start() { calls?.push("start"); return StartResult.started() },
    async stop() { calls?.push("stop"); return StopResult.stopped() },
  }
}

// -- StubbedEngine ------------------------------------------------------------

export interface StubbedEngineOptions {
  /** Tag embedded in canned responses so tests can verify routing. Defaults to "stub". */
  readonly id?: string
  /** Mutable array to record method calls into. */
  readonly calls?: string[]
}

export function StubbedEngine(options: StubbedEngineOptions = {}): Engine<InstallationScope> {
  const { id = "stub", calls } = options

  return {
    lifecycle: LifecycleManager.on({}),

    async load(ref: any) {
      calls?.push("load")
      return { ref, fields: { name: `from-${id}` } } as any
    },

    async loadField() {
      calls?.push("loadField")
      return `field-from-${id}` as any
    },

    async loadCollection() {
      calls?.push("loadCollection")
      return Page.empty()
    },

    async store(input: any) {
      calls?.push("store")
      return (input.ref ?? {}) as Ref<any>
    },

    async loadPage() {
      calls?.push("loadPage")
      return Page.empty() as Page<any>
    },

    async query(query: any) {
      calls?.push("query")
      return Page.from([{ source: id, query }], false) as Page<any>
    },
  }
}
