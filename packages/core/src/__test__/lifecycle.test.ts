import { describe, expect, test } from "bun:test";
import { LifecycleManager, type Lifecycle } from "../lifecycle.js";

// ============================================================================
// Helpers
// ============================================================================

/** A Lifecycle that records calls to start/stop in order. */
function tracked(name: string, log: string[]): Lifecycle {
  return {
    start: LifecycleManager.start(() => { log.push(`${name}:start`) }),
    stop: LifecycleManager.stop(() => { log.push(`${name}:stop`) }),
  }
}

// ============================================================================
// LifecycleManager.start
// ============================================================================

describe("LifecycleManager.start", () => {
  test("runs the function on first call", async () => {
    let count = 0
    const step = LifecycleManager.start(() => { count++ })
    await step()
    expect(count).toBe(1)
  })

  test("is idempotent — second call is a no-op", async () => {
    let count = 0
    const step = LifecycleManager.start(() => { count++ })
    await step()
    await step()
    await step()
    expect(count).toBe(1)
  })

  test("handles async functions", async () => {
    let value = ""
    const step = LifecycleManager.start(async () => {
      await Promise.resolve()
      value = "started"
    })
    await step()
    expect(value).toBe("started")
  })
})

// ============================================================================
// LifecycleManager.stop
// ============================================================================

describe("LifecycleManager.stop", () => {
  test("runs every time", async () => {
    let count = 0
    const step = LifecycleManager.stop(() => { count++ })
    await step()
    await step()
    expect(count).toBe(2)
  })
})

// ============================================================================
// LifecycleManager.none
// ============================================================================

describe("LifecycleManager.none", () => {
  test("is a no-op", async () => {
    const step = LifecycleManager.none()
    await step() // should not throw
  })
})

// ============================================================================
// LifecycleManager.auto
// ============================================================================

describe("LifecycleManager.auto", () => {
  test("starts dependencies in forward order", async () => {
    const log: string[] = []
    const a = tracked("a", log)
    const b = tracked("b", log)
    const c = tracked("c", log)

    const lifecycle = LifecycleManager.auto([a, b, c])
    await lifecycle.start()

    expect(log).toEqual(["a:start", "b:start", "c:start"])
  })

  test("stops dependencies in reverse order", async () => {
    const log: string[] = []
    const a = tracked("a", log)
    const b = tracked("b", log)
    const c = tracked("c", log)

    const lifecycle = LifecycleManager.auto([a, b, c])
    await lifecycle.start()
    log.length = 0

    await lifecycle.stop()
    expect(log).toEqual(["c:stop", "b:stop", "a:stop"])
  })

  test("starts parallel groups concurrently", async () => {
    const log: string[] = []
    const a = tracked("a", log)
    const b = tracked("b", log)
    const c = tracked("c", log)

    const lifecycle = LifecycleManager.auto([a, [b, c]])
    await lifecycle.start()

    // a starts first (sequential), then b and c (parallel — order within group is non-deterministic)
    expect(log[0]).toBe("a:start")
    expect(log.slice(1).sort()).toEqual(["b:start", "c:start"])
  })

  test("stops parallel groups concurrently in reverse", async () => {
    const log: string[] = []
    const a = tracked("a", log)
    const b = tracked("b", log)
    const c = tracked("c", log)

    const lifecycle = LifecycleManager.auto([a, [b, c]])
    await lifecycle.start()
    log.length = 0

    await lifecycle.stop()

    // [b, c] stop first (parallel), then a
    expect(log.slice(0, 2).sort()).toEqual(["b:stop", "c:stop"])
    expect(log[2]).toBe("a:stop")
  })

  test("start is idempotent (inherited from LifecycleManager.start)", async () => {
    const log: string[] = []
    const a = tracked("a", log)

    const lifecycle = LifecycleManager.auto([a])
    await lifecycle.start()
    await lifecycle.start()

    expect(log).toEqual(["a:start"])
  })

  test("works with empty dependency list", async () => {
    const lifecycle = LifecycleManager.auto([])
    await lifecycle.start()
    await lifecycle.stop()
    // should not throw
  })

  test("mixed sequential and parallel", async () => {
    const log: string[] = []
    const a = tracked("a", log)
    const b = tracked("b", log)
    const c = tracked("c", log)
    const d = tracked("d", log)

    const lifecycle = LifecycleManager.auto([a, [b, c], d])
    await lifecycle.start()

    expect(log[0]).toBe("a:start")
    expect(log.slice(1, 3).sort()).toEqual(["b:start", "c:start"])
    expect(log[3]).toBe("d:start")

    log.length = 0
    await lifecycle.stop()

    expect(log[0]).toBe("d:stop")
    expect(log.slice(1, 3).sort()).toEqual(["b:stop", "c:stop"])
    expect(log[3]).toBe("a:stop")
  })
})
