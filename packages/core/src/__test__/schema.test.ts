import { describe, test, expect } from "bun:test";
import { EntityDef, Field, Schema } from "@max/core";

// ============================================================================
// Test Entities (Acme-style)
// ============================================================================

const AcmeUser = EntityDef.create("AcmeUser", {
  name: Field.string(),
  email: Field.string(),
});

const AcmeTeam = EntityDef.create("AcmeTeam", {
  name: Field.string(),
  owner: Field.ref(AcmeUser),
  members: Field.collection(AcmeUser),
});

const AcmeRoot = EntityDef.create("AcmeRoot", {
  teams: Field.collection(AcmeTeam),
});

// ============================================================================
// Tests
// ============================================================================

describe("Schema", () => {
  const schema = Schema.create({
    namespace: "acme",
    entities: [AcmeUser, AcmeTeam, AcmeRoot],
    roots: [AcmeRoot],
  });

  test("namespace", () => {
    expect(schema.namespace).toBe("acme");
  });

  test("entities", () => {
    expect(schema.entities).toHaveLength(3);
    expect(schema.entities).toContain(AcmeUser);
    expect(schema.entities).toContain(AcmeTeam);
    expect(schema.entities).toContain(AcmeRoot);
  });

  test("roots", () => {
    expect(schema.roots).toHaveLength(1);
    expect(schema.roots).toContain(AcmeRoot);
  });

  test("entityTypes", () => {
    expect(schema.entityTypes).toEqual(["AcmeUser", "AcmeTeam", "AcmeRoot"]);
  });

  test("getDefinition by name", () => {
    expect(schema.getDefinition("AcmeUser")).toBe(AcmeUser);
    expect(schema.getDefinition("AcmeTeam")).toBe(AcmeTeam);
    expect(schema.getDefinition("AcmeRoot")).toBe(AcmeRoot);
  });

  test("getDefinition returns undefined for unknown name", () => {
    expect(schema.getDefinition("Nonexistent")).toBeUndefined();
  });

  describe("relationships", () => {
    test("derives ref fields as cardinality one", () => {
      const ownerRel = schema.relationships.find(
        (r) => r.from === "AcmeTeam" && r.field === "owner"
      );
      expect(ownerRel).toEqual({
        from: "AcmeTeam",
        field: "owner",
        to: "AcmeUser",
        cardinality: "one",
      });
    });

    test("derives collection fields as cardinality many", () => {
      const membersRel = schema.relationships.find(
        (r) => r.from === "AcmeTeam" && r.field === "members"
      );
      expect(membersRel).toEqual({
        from: "AcmeTeam",
        field: "members",
        to: "AcmeUser",
        cardinality: "many",
      });

      const teamsRel = schema.relationships.find(
        (r) => r.from === "AcmeRoot" && r.field === "teams"
      );
      expect(teamsRel).toEqual({
        from: "AcmeRoot",
        field: "teams",
        to: "AcmeTeam",
        cardinality: "many",
      });
    });

    test("does not include scalar fields", () => {
      const scalarRel = schema.relationships.find(
        (r) => r.field === "name" || r.field === "email"
      );
      expect(scalarRel).toBeUndefined();
    });
  });

  test("entities array is frozen", () => {
    expect(Object.isFrozen(schema.entities)).toBe(true);
  });

  test("roots array is frozen", () => {
    expect(Object.isFrozen(schema.roots)).toBe(true);
  });

  test("throws if root is not in entities list", () => {
    const Orphan = EntityDef.create("Orphan", { name: Field.string() });

    expect(() =>
      Schema.create({
        namespace: "bad",
        entities: [AcmeUser],
        roots: [Orphan],
      })
    ).toThrow('Root entity "Orphan" is not in the entities list');
  });
});
