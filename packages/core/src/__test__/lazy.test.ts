import {describe, expect, test} from "bun:test";
import {makeLazy} from "../lazy.js";

interface Testing {
  neverLoaded: string
  foo: number
  bar: string
  baz: Testing
}
const x: Testing = makeLazy<Testing>({
  neverLoaded: () => { throw new Error('should not be loaded ')},
  foo: () => 1,
  bar: () => String(x.foo),
  baz: () => x,
})

describe("lazy", () => {
  test("lazy works", () => {
    // This asserts that:
    // - baz and foo are available as expected
    // - neverLoaded is not loaded
    expect(x.baz.foo).toBe(1)
  })
})
