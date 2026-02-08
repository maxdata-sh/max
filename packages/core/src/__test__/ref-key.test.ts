import { describe, test, expect } from "bun:test";
import { RefKey, type EntityType, type EntityId, type InstallationId } from "../ref-key.js";

describe("RefKey", () => {
  describe("local", () => {
    test("round-trips through create and parse", () => {
      const key = RefKey.local("User" as EntityType, "u1" as EntityId);
      const parsed = RefKey.parse(key);

      expect(parsed.scope).toEqual({ kind: "local" });
      expect(parsed.entityType).toBe("User");
      expect(parsed.entityId).toBe("u1");
    });

    test("handles entityId containing colons", () => {
      const key = RefKey.local("User" as EntityType, "user:123" as EntityId);
      const parsed = RefKey.parse(key);

      expect(parsed.scope).toEqual({ kind: "local" });
      expect(parsed.entityType).toBe("User");
      expect(parsed.entityId).toBe("user:123");
    });

    test("handles entityId with many colons", () => {
      const id = "a:b:c:d:e:f" as EntityId;
      const key = RefKey.local("Thing" as EntityType, id);
      const parsed = RefKey.parse(key);

      expect(parsed.entityType).toBe("Thing");
      expect(parsed.entityId).toBe("a:b:c:d:e:f");
    });
  });

  describe("system", () => {
    test("round-trips through create and parse", () => {
      const key = RefKey.system(
        "inst-1" as InstallationId,
        "Team" as EntityType,
        "t1" as EntityId,
      );
      const parsed = RefKey.parse(key);

      expect(parsed.scope).toEqual({ kind: "system", installationId: "inst-1" });
      expect(parsed.entityType).toBe("Team");
      expect(parsed.entityId).toBe("t1");
    });

    test("handles entityId containing colons", () => {
      const key = RefKey.system(
        "inst-1" as InstallationId,
        "Team" as EntityType,
        "team:42" as EntityId,
      );
      const parsed = RefKey.parse(key);

      expect(parsed.scope).toEqual({ kind: "system", installationId: "inst-1" });
      expect(parsed.entityType).toBe("Team");
      expect(parsed.entityId).toBe("team:42");
    });

    test("handles entityId with many colons", () => {
      const id = "x:y:z:w" as EntityId;
      const key = RefKey.system("inst-2" as InstallationId, "Widget" as EntityType, id);
      const parsed = RefKey.parse(key);

      expect(parsed.entityType).toBe("Widget");
      expect(parsed.entityId).toBe("x:y:z:w");
    });
  });

  describe("from() with scope", () => {
    test("creates local key when scope is local", () => {
      const key = RefKey.from("User" as EntityType, "u:1" as EntityId, { kind: "local" });
      const parsed = RefKey.parse(key);

      expect(parsed.scope).toEqual({ kind: "local" });
      expect(parsed.entityId).toBe("u:1");
    });

    test("creates system key when scope is system", () => {
      const key = RefKey.from("User" as EntityType, "u:1" as EntityId, {
        kind: "system",
        installationId: "inst-1" as InstallationId,
      });
      const parsed = RefKey.parse(key);

      expect(parsed.scope).toEqual({ kind: "system", installationId: "inst-1" });
      expect(parsed.entityId).toBe("u:1");
    });
  });

  describe("invalid inputs", () => {
    test("throws on empty string", () => {
      expect(() => RefKey.parse("" as RefKey)).toThrow("Invalid RefKey format");
    });

    test("throws on no delimiters", () => {
      expect(() => RefKey.parse("garbage" as RefKey)).toThrow("Invalid RefKey format");
    });

    test("throws on single delimiter", () => {
      expect(() => RefKey.parse("local:" as RefKey)).toThrow("Invalid RefKey format");
    });

    test("throws on unknown scope", () => {
      expect(() => RefKey.parse("other:Type:id" as RefKey)).toThrow("Invalid RefKey format");
    });

    test("throws on system key with only two segments after scope", () => {
      expect(() => RefKey.parse("system:inst:type" as RefKey)).toThrow("Invalid RefKey format");
    });
  });

  describe("tryParse", () => {
    test("returns parsed result for valid key", () => {
      const key = RefKey.local("User" as EntityType, "u1" as EntityId);
      expect(RefKey.tryParse(key as string)).toEqual({
        scope: { kind: "local" },
        entityType: "User",
        entityId: "u1",
      });
    });

    test("returns undefined for invalid string", () => {
      expect(RefKey.tryParse("nope")).toBeUndefined();
    });
  });

  describe("isValid", () => {
    test("returns true for valid local key", () => {
      expect(RefKey.isValid("local:User:u1")).toBe(true);
    });

    test("returns true for valid system key", () => {
      expect(RefKey.isValid("system:inst:User:u1")).toBe(true);
    });

    test("returns false for garbage", () => {
      expect(RefKey.isValid("not-a-key")).toBe(false);
    });
  });
});
