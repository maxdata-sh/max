import { describe, test, expect } from "bun:test";
import {MaxError, ErrFacet, type ErrDataFacet, type MaxErrorJSON, ErrorDef} from "../max-error.js";

// -- Test facets and error definitions -----------------------------------------

const NotFound = ErrFacet.marker("NotFound");
const Retryable = ErrFacet.marker("Retryable");

const HasRef = ErrFacet.data<{ ref: string }>("HasRef");
const HasInstallation = ErrFacet.data<{ installationId: string; name?: string }>("HasInstallation");

const ErrEntityNotFound = MaxError.define("storage.entity_not_found", {
  facets: [NotFound, HasRef],
  message: (d) => `Entity not found: ${d.ref}`,
});

const ErrConnectionFailed = MaxError.define("network.connection_failed", {
  facets: [Retryable],
  message: () => "Connection failed",
});

const ErrMarkerOnly = MaxError.define("test.marker_only", {
  facets: [NotFound],
  message: () => "Something was not found",
});

const ErrMultiData = MaxError.define("storage.multi_data", {
  facets: [HasRef, HasInstallation],
  message: (d) => `Entity ${d.ref} in installation ${d.installationId}`,
});

// -- Tests ---------------------------------------------------------------------

describe("Facet", () => {
  test("marker() creates correct shape", () => {
    expect(NotFound.kind).toBe("marker");
    expect(NotFound.name).toBe("NotFound");
  });

  test("data() creates correct shape", () => {
    expect(HasRef.kind).toBe("data");
    expect(HasRef.name).toBe("HasRef");
  });

  test("facets are frozen", () => {
    expect(Object.isFrozen(NotFound)).toBe(true);
    expect(Object.isFrozen(HasRef)).toBe(true);
  });
});

describe("MaxError.define()", () => {
  test("creates ErrorDef with code and domain", () => {
    expect(ErrEntityNotFound.code).toBe("storage.entity_not_found");
    expect(ErrEntityNotFound.domain).toBe("storage");
  });

  test("domain derived from code prefix", () => {
    expect(ErrConnectionFailed.domain).toBe("network");
  });

  test("single-segment code uses itself as domain", () => {
    const Simple = MaxError.define("simple", {
      facets: [],
      message: () => "simple error",
    });
    expect(Simple.domain).toBe("simple");
  });
});

describe("ErrorDef.create()", () => {
  test("creates MaxError with correct code, message, data", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });

    expect(err.code).toBe("storage.entity_not_found");
    expect(err.domain).toBe("storage");
    expect(err.message).toBe("Entity not found: User:u1");
    expect(err.data.ref).toBe("User:u1");
  });

  test("context supplements message with ' — '", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" }, "during sync");

    expect(err.message).toBe("Entity not found: User:u1 — during sync");
    expect(err.context).toBe("during sync");
  });

  test("works with marker-only facets: create({})", () => {
    const err = ErrMarkerOnly.create({});

    expect(err.code).toBe("test.marker_only");
    expect(err.message).toBe("Something was not found");
  });

  test("instanceof Error, has stack trace", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });

    expect(err).toBeInstanceOf(Error);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("max-error.test.ts");
  });

  test("Error.name is MaxError[code]", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });

    expect(err.name).toBe("MaxError[storage.entity_not_found]");
  });

  test("data is a shallow copy", () => {
    const data = { ref: "User:u1" };
    const err = ErrEntityNotFound.create(data);
    data.ref = "mutated";

    expect(err.data.ref).toBe("User:u1");
  });
});

describe("ErrorDef.is()", () => {
  test("matches same definition", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    expect(ErrEntityNotFound.is(err)).toBe(true);
  });

  test("rejects different definition", () => {
    const err = ErrConnectionFailed.create({});
    expect(ErrEntityNotFound.is(err)).toBe(false);
  });

  test("rejects plain Error", () => {
    expect(ErrEntityNotFound.is(new Error("nope"))).toBe(false);
  });

  test("rejects non-errors", () => {
    expect(ErrEntityNotFound.is(null)).toBe(false);
    expect(ErrEntityNotFound.is(undefined)).toBe(false);
    expect(ErrEntityNotFound.is("string")).toBe(false);
    expect(ErrEntityNotFound.is(42)).toBe(false);
  });

  test("narrows data type (compile-time DX check)", () => {
    const err: unknown = ErrEntityNotFound.create({ ref: "User:u1" });

    if (ErrEntityNotFound.is(err)) {
      // This line is a compile-time check — if it compiles, the type narrowing works
      const ref: string = err.data.ref;
      expect(ref).toBe("User:u1");
    } else {
      throw new Error("Expected is() to match");
    }
  });
});

describe("MaxError.has()", () => {
  test("detects marker facets", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    expect(MaxError.has(err, NotFound)).toBe(true);
  });

  test("detects data facets", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    expect(MaxError.has(err, HasRef)).toBe(true);
  });

  test("returns false for absent facets", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    expect(MaxError.has(err, Retryable)).toBe(false);
    expect(MaxError.has(err, HasInstallation)).toBe(false);
  });

  test("returns false for non-MaxErrors", () => {
    expect(MaxError.has(new Error("nope"), NotFound)).toBe(false);
    expect(MaxError.has(null, NotFound)).toBe(false);
    expect(MaxError.has("string", NotFound)).toBe(false);
  });

  test("narrows data type for data facets", () => {
    const err: unknown = ErrEntityNotFound.create({ ref: "User:u1" });

    if (MaxError.isMaxError(err) && MaxError.has(err, HasRef)) {
      // Compile-time check: data is narrowed to include { ref: string }
      const ref: string = err.data.ref;
      expect(ref).toBe("User:u1");
    } else {
      throw new Error("Expected has() to match");
    }
  });

  test("chained has() narrows progressively", () => {
    const err: unknown = ErrMultiData.create({
      ref: "User:u1",
      installationId: "inst-1",
    });

    if (MaxError.isMaxError(err) && MaxError.has(err, HasRef) && MaxError.has(err, HasInstallation)) {
      // Both data facets narrowed — compile-time check
      const ref: string = err.data.ref;
      const instId: string = err.data.installationId;
      expect(ref).toBe("User:u1");
      expect(instId).toBe("inst-1");
    } else {
      throw new Error("Expected chained has() to match");
    }
  });
});

describe("MaxError.inDomain()", () => {
  test("matches same domain", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    expect(MaxError.inDomain(err, "storage")).toBe(true);
  });

  test("rejects different domain", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    expect(MaxError.inDomain(err, "network")).toBe(false);
  });
});

describe("MaxError.enrich()", () => {
  test("adds optional fields to error data", () => {
    const err = ErrMultiData.create({
      ref: "User:u1",
      installationId: "inst-1",
    });

    MaxError.enrich(err, HasInstallation, { name: "My Installation" });

    expect(err.data.name).toBe("My Installation");
  });

  test("preserves existing required fields", () => {
    const err = ErrMultiData.create({
      ref: "User:u1",
      installationId: "inst-1",
    });

    MaxError.enrich(err, HasInstallation, { name: "enriched" });

    expect(err.data.ref).toBe("User:u1");
    expect(err.data.installationId).toBe("inst-1");
    expect(err.data.name).toBe("enriched");
  });
});

describe("MaxError.wrap()", () => {
  test("passes through MaxErrors unchanged", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    const wrapped = MaxError.wrap(err);

    expect(wrapped).toBe(err);
  });

  test("wraps plain Error preserving stack", () => {
    const original = new Error("boom");
    const wrapped = MaxError.wrap(original);

    expect(MaxError.isMaxError(wrapped)).toBe(true);
    expect(wrapped.code).toBe("unknown");
    expect(wrapped.domain).toBe("unknown");
    expect(wrapped.message).toBe("boom");
    expect(wrapped.stack).toBe(original.stack);
  });

  test("wraps strings", () => {
    const wrapped = MaxError.wrap("something broke");

    expect(MaxError.isMaxError(wrapped)).toBe(true);
    expect(wrapped.message).toBe("something broke");
    expect(wrapped.code).toBe("unknown");
  });
});

describe("toJSON()", () => {
  test("returns structured, JSON.stringify-safe object", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" }, "during sync");
    const json = err.toJSON();

    expect(json.code).toBe("storage.entity_not_found");
    expect(json.domain).toBe("storage");
    expect(json.message).toBe("Entity not found: User:u1 — during sync");
    expect(json.context).toBe("during sync");
    expect(json.data).toEqual({ ref: "User:u1" });
    expect(json.facets).toEqual(expect.arrayContaining(["NotFound", "HasRef"]));
    expect(json.stack).toBeDefined();

    // Verify it's actually JSON-safe
    const roundTripped = JSON.parse(JSON.stringify(json)) as MaxErrorJSON;
    expect(roundTripped.code).toBe("storage.entity_not_found");
  });

  test("omits context when not provided", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    const json = err.toJSON();

    expect(json.context).toBeUndefined();
  });
});

describe("DX: full error handling flow", () => {
  test("define → throw → catch by exact type → read data", () => {
    try {
      throw ErrEntityNotFound.create({ ref: "User:u1" }, "loading profile");
    } catch (err) {
      if (ErrEntityNotFound.is(err)) {
        expect(err.data.ref).toBe("User:u1");
        expect(err.context).toBe("loading profile");
        return;
      }
      throw new Error("Should have matched ErrEntityNotFound");
    }
  });

  test("define → throw → catch by facet (any not-found)", () => {
    try {
      throw ErrEntityNotFound.create({ ref: "Team:t1"});
    } catch (err) {
      if (MaxError.has(err, NotFound)) {
        // Matched by facet — any NotFound error, regardless of code
        expect(err.facetNames.has("NotFound")).toBe(true);
        return;
      }
      throw new Error("Should have matched NotFound facet");
    }
  });

  test("define → throw → enrich at boundary → catch with enriched data", () => {
    try {
      const err = ErrMultiData.create({
        ref: "User:u1",
        installationId: "inst-1",
      });

      // Simulate boundary enrichment
      MaxError.enrich(err, HasInstallation, { name: "Acme Corp" });

      throw err;
    } catch (err) {
      if (ErrMultiData.is(err)) {
        expect(err.data.ref).toBe("User:u1");
        expect(err.data.installationId).toBe("inst-1");
        expect(err.data.name).toBe("Acme Corp");
        return;
      }
      throw new Error("Should have matched ErrMultiData");
    }
  });


  test("DX", () => {
    try{
      throw ErrEntityNotFound.create({ ref:"123" })
    }catch (e){
      console.error(e)
    }
  })
});

describe("inspect output", () => {
  // Helper to invoke the custom inspect symbol
  const inspect = (err: MaxError): string => {
    const fn = (err as any)[Symbol.for("nodejs.util.inspect.custom")];
    return fn.call(err);
  };

  test("header line: code + message first", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    const output = inspect(err);
    const firstLine = output.split("\n")[0];

    expect(firstLine).toBe("MaxError[storage.entity_not_found]: Entity not found: User:u1");
  });

  test("compact data on one line when short", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    const output = inspect(err);
    const lines = output.split("\n");

    // Second line should be the compact data
    expect(lines[1]).toBe('  {"ref":"User:u1"}');
  });

  test("expanded data when over 60 chars", () => {
    const err = ErrMultiData.create({
      ref: "User:u1",
      installationId: "inst-very-long-installation-id-that-pushes-over-threshold",
    });
    const output = inspect(err);

    // Should contain indented multiline JSON
    expect(output).toContain('  {\n');
    expect(output).toContain('    "ref": "User:u1"');
  });

  test("no data block for marker-only errors", () => {
    const err = ErrMarkerOnly.create({});
    const output = inspect(err);
    const lines = output.split("\n");

    // First line is header, next should be a stack frame (starts with "    at")
    expect(lines[0]).toBe("MaxError[test.marker_only]: Something was not found");
    expect(lines[1].trimStart().startsWith("at ")).toBe(true);
  });

  test("stack frames present without redundant first line", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" });
    const output = inspect(err);

    // Should contain stack frames
    expect(output).toContain("    at ");
    // Should NOT contain the raw Error name:message line that .stack normally starts with
    expect(output).not.toContain("MaxError[storage.entity_not_found]: Entity not found: User:u1\n    at ");
    // But the header IS our first line (not duplicated from .stack)
    expect(output.startsWith("MaxError[storage.entity_not_found]: Entity not found: User:u1\n")).toBe(true);
  });

  test("context in header message", () => {
    const err = ErrEntityNotFound.create({ ref: "User:u1" }, "during sync");
    const output = inspect(err);
    const firstLine = output.split("\n")[0];

    expect(firstLine).toBe("MaxError[storage.entity_not_found]: Entity not found: User:u1 — during sync");
  });
});
