import { describe, test, expect } from "bun:test"
import { MaxError, ErrFacet, SerializedError } from '../max-error.js'

// -- Test setup ---------------------------------------------------------------

const NotFound = ErrFacet.marker("NotFound")
const Retryable = ErrFacet.marker("Retryable")
const HasRef = ErrFacet.data<{ ref: string }>("HasRef")

const Storage = MaxError.boundary("storage")
const Network = MaxError.boundary("network")

const ErrEntityNotFound = Storage.define("entity_not_found", {
  facets: [NotFound, HasRef],
  message: (d) => `Entity not found: ${d.ref}`,
})

const ErrConnectionFailed = Network.define("connection_failed", {
  facets: [Retryable],
  message: () => "Connection failed",
})

// -- serialize ----------------------------------------------------------------

describe("MaxError.serialize", () => {
  test("serializes a MaxError with code, boundary, facets, and data", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" })
    const serialized = MaxError.serialize(err)

    expect(serialized.message).toBe("Entity not found: User:u1")
    expect(serialized.code).toBe("storage.entity_not_found")
    expect(serialized.boundary).toBe("storage")
    expect(serialized.facets).toEqual(["NotFound", "HasRef"])
    expect(serialized.data).toEqual({ ref: "User:u1" })
    expect(serialized.cause).toBeUndefined()
  })

  test("serializes cause chain", () => {
    const inner = ErrConnectionFailed.create({})
    const outer = ErrEntityNotFound.create({ ref: "User:u1" }, "during sync", inner)
    const serialized = MaxError.serialize(outer)

    expect(serialized.cause).toBeDefined()
    expect(serialized.cause!.code).toBe("network.connection_failed")
    expect(serialized.cause!.boundary).toBe("network")
    expect(serialized.cause!.facets).toEqual(["Retryable"])
  })

  test("serializes plain Error as just message", () => {
    const err = new Error("something broke")
    const serialized = MaxError.serialize(err)

    expect(serialized.message).toBe("something broke")
    expect(serialized.code).toBeUndefined()
    expect(serialized.boundary).toBeUndefined()
    expect(serialized.facets).toBeUndefined()
  })

  test("serializes string as message", () => {
    const serialized = MaxError.serialize("oops")
    expect(serialized.message).toBe("oops")
  })
})

// -- reconstitute -------------------------------------------------------------

describe("MaxError.reconstitute", () => {
  test("round-trip preserves code, domain, message, facets, data", () => {
    const original = ErrEntityNotFound.create({ ref: "User:u1" })
    const serialized = MaxError.serialize(original)
    const reconstituted = MaxError.reconstitute(serialized)

    expect(reconstituted.code).toBe("storage.entity_not_found")
    expect(reconstituted.domain).toBe("storage")
    expect(reconstituted.message).toBe("Entity not found: User:u1")
    expect(reconstituted.data).toEqual({ ref: "User:u1" })
    expect([...reconstituted.facetNames]).toEqual(["NotFound", "HasRef"])
  })

  test("MaxError.has() works on reconstituted errors", () => {
    const original = ErrEntityNotFound.create({ ref: "User:u1" })
    const reconstituted = MaxError.reconstitute(MaxError.serialize(original))

    expect(MaxError.has(reconstituted, NotFound)).toBe(true)
    expect(MaxError.has(reconstituted, HasRef)).toBe(true)
    expect(MaxError.has(reconstituted, Retryable)).toBe(false)
  })

  test("boundary.is() works on reconstituted errors", () => {
    const original = ErrEntityNotFound.create({ ref: "User:u1" })
    const reconstituted = MaxError.reconstitute(MaxError.serialize(original))

    expect(Storage.is(reconstituted)).toBe(true)
    expect(Network.is(reconstituted)).toBe(false)
  })

  test("preserves cause chain", () => {
    const inner = ErrConnectionFailed.create({})
    const outer = ErrEntityNotFound.create({ ref: "User:u1" }, "during sync", inner)
    const reconstituted = MaxError.reconstitute(MaxError.serialize(outer))

    expect(reconstituted.cause).toBeDefined()
    expect(reconstituted.cause!.code).toBe("network.connection_failed")
    expect(Network.is(reconstituted.cause!)).toBe(true)
    expect(MaxError.has(reconstituted.cause!, Retryable)).toBe(true)
  })

  test("reconstitutes plain error serialization", () => {
    const serialized: SerializedError = { message: "something broke" }
    const reconstituted = MaxError.reconstitute(serialized)

    expect(reconstituted.message).toBe("something broke")
    expect(reconstituted.code).toBe("unknown")
    expect(reconstituted.domain).toBe("unknown")
  })

  test("MaxError.isMaxError() works on reconstituted errors", () => {
    const original = ErrEntityNotFound.create({ ref: "User:u1" })
    const reconstituted = MaxError.reconstitute(MaxError.serialize(original))

    expect(MaxError.isMaxError(reconstituted)).toBe(true)
  })
})
