/**
 * Tests for Batch<V, K>
 */

import { describe, test, expect } from "bun:test";
import { Batch, type Keyable } from "../batch.js";

// ============================================================================
// Test Helpers
// ============================================================================

interface User {
  id: string;
  name: string;
  email: string;
}

const users: User[] = [
  { id: "u1", name: "Alice", email: "alice@example.com" },
  { id: "u2", name: "Bob", email: "bob@example.com" },
  { id: "u3", name: "Charlie", email: "charlie@example.com" },
];

/** A keyable reference type (like our Ref) */
class TestRef implements Keyable {
  constructor(readonly type: string, readonly id: string) {}

  toKey(): string {
    return `${this.type}:${this.id}`;
  }
}

interface EntityInput {
  ref: TestRef;
  fields: { name: string; value: number };
}

// ============================================================================
// Tests
// ============================================================================

describe("Batch", () => {
  describe("buildFrom().withKey()", () => {
    test("creates a batch from values with key extractor", () => {
      const batch = Batch.buildFrom(users).withKey((u) => u.id);

      expect(batch.inputSize).toBe(3);
      expect(batch.values.length).toBe(3);
      expect(batch.isFullyResolved).toBe(true);
    });

    test("allows lookup by key", () => {
      const batch = Batch.buildFrom(users).withKey((u) => u.id);

      expect(batch.get("u1")).toEqual(users[0]);
      expect(batch.get("u2")).toEqual(users[1]);
      expect(batch.get("u3")).toEqual(users[2]);
      expect(batch.get("u99")).toBeUndefined();
    });

    test("getOrThrow returns value or throws", () => {
      const batch = Batch.buildFrom(users).withKey((u) => u.id);

      expect(batch.getOrThrow("u1")).toEqual(users[0]);
      expect(() => batch.getOrThrow("u99")).toThrow("Batch value missing for key: u99");
    });

    test("has() checks key existence", () => {
      const batch = Batch.buildFrom(users).withKey((u) => u.id);

      expect(batch.has("u1")).toBe(true);
      expect(batch.has("u99")).toBe(false);
    });
  });

  describe("byId()", () => {
    test("creates a batch keyed by .id", () => {
      const batch = Batch.byId(users);

      expect(batch.get("u1")).toEqual(users[0]);
      expect(batch.get("u2")).toEqual(users[1]);
    });
  });

  describe("fromRecord()", () => {
    test("creates a batch from a record", () => {
      const batch = Batch.fromRecord({
        a: 1,
        b: 2,
        c: 3,
      });

      expect(batch.get("a")).toBe(1);
      expect(batch.get("b")).toBe(2);
      expect(batch.get("c")).toBe(3);
      expect(batch.inputSize).toBe(3);
    });
  });

  describe("fromEntries()", () => {
    test("creates a batch from key-value entries", () => {
      const batch = Batch.fromEntries([
        { key: "x", value: 10 },
        { key: "y", value: 20 },
      ]);

      expect(batch.get("x")).toBe(10);
      expect(batch.get("y")).toBe(20);
    });
  });

  describe("fromList()", () => {
    test("creates a batch keyed by a specified property", () => {
      const batch = Batch.fromList(users, "id");

      expect(batch.get("u1")?.name).toBe("Alice");
      expect(batch.get("u2")?.name).toBe("Bob");
    });

    test("works with email as key", () => {
      const batch = Batch.fromList(users, "email");

      expect(batch.get("alice@example.com")?.name).toBe("Alice");
      expect(batch.get("bob@example.com")?.name).toBe("Bob");
    });
  });

  describe("Keyable objects as keys", () => {
    test("supports objects with toKey() as keys", () => {
      const inputs: EntityInput[] = [
        { ref: new TestRef("User", "1"), fields: { name: "a", value: 1 } },
        { ref: new TestRef("User", "2"), fields: { name: "b", value: 2 } },
        { ref: new TestRef("User", "3"), fields: { name: "c", value: 3 } },
      ];

      const batch = Batch.buildFrom(inputs).withKey((i) => i.ref);

      expect(batch.get(new TestRef("User", "1"))?.fields.name).toBe("a");
      expect(batch.get(new TestRef("User", "2"))?.fields.value).toBe(2);
      expect(batch.get(new TestRef("User", "99"))).toBeUndefined();
    });
  });

  describe("unresolvable tracking", () => {
    test("tracks unresolvable keys when withInputs narrows", () => {
      const batch = Batch.byId(users);

      // Narrow to a set that includes a missing key
      const narrowed = batch.withInputs(["u1", "u99" as any]);

      expect(narrowed.isFullyResolved).toBe(false);
      expect(narrowed.unresolvableKeys.has("u99")).toBe(true);
      expect(narrowed.unresolvableInputs).toEqual(["u99"]);
    });

    test("isFullyResolved is true when all inputs resolve", () => {
      const batch = Batch.byId(users).withInputs(["u1", "u2"]);

      expect(batch.isFullyResolved).toBe(true);
      expect(batch.unresolvableKeys.size).toBe(0);
    });
  });

  describe("mapValues()", () => {
    test("transforms values while preserving keys", () => {
      const batch = Batch.byId(users);
      const mapped = batch.mapValues((user) => user.name.toUpperCase());

      expect(mapped.get("u1")).toBe("ALICE");
      expect(mapped.get("u2")).toBe("BOB");
      expect(mapped.get("u3")).toBe("CHARLIE");
    });

    test("preserves input tracking through map", () => {
      const batch = Batch.byId(users).withInputs(["u1", "u99" as any]);
      const mapped = batch.mapValues((user) => user.name);

      expect(mapped.isFullyResolved).toBe(false);
      expect(mapped.unresolvableKeys.has("u99")).toBe(true);
    });
  });

  describe("withInputs()", () => {
    test("re-scopes batch to new inputs", () => {
      const batch = Batch.byId(users);

      const scoped = batch.withInputs(["u2"]);

      expect(scoped.inputSize).toBe(1);
      expect(scoped.get("u2")).toEqual(users[1]);
      expect(scoped.isFullyResolved).toBe(true);
    });
  });

  describe("toRecord()", () => {
    test("converts to sparse record", () => {
      const batch = Batch.byId(users);
      const record = batch.toRecord();

      expect(record["u1"]).toEqual(users[0]);
      expect(record["u2"]).toEqual(users[1]);
      expect(Object.keys(record).length).toBe(3);
    });
  });

  describe("toRecordWithDefaults()", () => {
    test("fills in defaults for missing keys", () => {
      const batch = Batch.byId(users).withInputs(["u1", "u99" as any]);
      const record = batch.toRecordWithDefaults((key) => ({
        id: key,
        name: "Unknown",
        email: "unknown@example.com",
      }));

      expect(record["u1"]).toEqual(users[0]);
      expect(record["u99"]).toEqual({
        id: "u99",
        name: "Unknown",
        email: "unknown@example.com",
      });
    });
  });

  describe("keys(), entries()", () => {
    test("returns all keys", () => {
      const batch = Batch.fromRecord({ a: 1, b: 2 });
      expect(batch.keys().sort()).toEqual(["a", "b"]);
    });

    test("returns all entries", () => {
      const batch = Batch.fromRecord({ a: 1, b: 2 });
      const entries = batch.entries().sort((x, y) => x[0].localeCompare(y[0]));
      expect(entries).toEqual([
        ["a", 1],
        ["b", 2],
      ]);
    });
  });

  describe("empty()", () => {
    test("creates an empty batch", () => {
      const batch = Batch.empty<User>();

      expect(batch.inputSize).toBe(0);
      expect(batch.values.length).toBe(0);
      expect(batch.isFullyResolved).toBe(true);
    });
  });
});
