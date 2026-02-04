/**
 * Basic e2e tests for SqliteEngine.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Fields } from "@max/core";
import { AcmeUser, AcmeTeam, AcmeProject } from "@max/connector-acme";
import { SqliteEngine, SqliteSchema } from "../index.js";

// ============================================================================
// Tests
// ============================================================================

describe("SqliteEngine", () => {
  let db: Database;
  let schema: SqliteSchema;
  let engine: SqliteEngine;

  beforeEach(() => {
    db = new Database(":memory:");
    schema = new SqliteSchema()
      .register(AcmeUser)
      .register(AcmeTeam)
      .register(AcmeProject);
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);
  });

  describe("store and load", () => {
    test("store and load a simple entity", async () => {
      // Store
      const ref = await engine.store({
        ref: AcmeUser.ref("u1"),
        fields: {
          name: "Alice",
          email: "alice@example.com",
          age: 30,
          isAdmin: true,
        },
      });

      expect(ref.id).toBe("u1");

      // Load all fields
      const result = await engine.load(ref, Fields.ALL);

      expect(result.fields.name).toBe("Alice");
      expect(result.fields.email).toBe("alice@example.com");
      expect(result.fields.age).toBe(30);
      expect(result.fields.isAdmin).toBe(true);
    });

    test("load specific fields", async () => {
      await engine.store({
        ref: AcmeUser.ref("u2"),
        fields: {
          name: "Bob",
          email: "bob@example.com",
          age: 25,
          isAdmin: false,
        },
      });

      const result = await engine.load(AcmeUser.ref("u2"), Fields.select("name", "email"));

      expect(result.fields.name).toBe("Bob");
      expect(result.fields.email).toBe("bob@example.com");
      // age and isAdmin not loaded
      expect(result.has("age")).toBe(false);
    });

    test("store and load with ref field", async () => {
      await engine.store({
        ref: AcmeUser.ref("owner1"),
        fields: { name: "Owner", email: "owner@example.com", age: 40, isAdmin: true },
      });

      await engine.store({
        ref: AcmeTeam.ref("team1"),
        fields: {
          name: "Engineering",
          description: "The engineering team",
          owner: AcmeUser.ref("owner1"),
        },
      });

      const team = await engine.load(AcmeTeam.ref("team1"), Fields.ALL);

      expect(team.fields.name).toBe("Engineering");
      expect(team.fields.owner.id).toBe("owner1");
      expect(team.fields.owner.entityType).toBe("AcmeUser");
    });

    test("upsert updates existing entity", async () => {
      await engine.store({
        ref: AcmeUser.ref("u3"),
        fields: { name: "Charlie", email: "charlie@example.com", age: 20, isAdmin: false },
      });

      // Update
      await engine.store({
        ref: AcmeUser.ref("u3"),
        fields: { name: "Charles", email: "charles@example.com", age: 21, isAdmin: true },
      });

      const result = await engine.load(AcmeUser.ref("u3"), Fields.ALL);

      expect(result.fields.name).toBe("Charles");
      expect(result.fields.age).toBe(21);
    });
  });

  describe("loadField", () => {
    test("load a single field", async () => {
      await engine.store({
        ref: AcmeUser.ref("u4"),
        fields: { name: "Diana", email: "diana@example.com", age: 28, isAdmin: false },
      });

      const name = await engine.loadField(AcmeUser.ref("u4"), "name");
      expect(name).toBe("Diana");

      const isAdmin = await engine.loadField(AcmeUser.ref("u4"), "isAdmin");
      expect(isAdmin).toBe(false);
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      await engine.store({ ref: AcmeUser.ref("u1"), fields: { name: "Alice", email: "a@test.com", age: 30, isAdmin: true } });
      await engine.store({ ref: AcmeUser.ref("u2"), fields: { name: "Bob", email: "b@test.com", age: 25, isAdmin: false } });
      await engine.store({ ref: AcmeUser.ref("u3"), fields: { name: "Charlie", email: "c@test.com", age: 35, isAdmin: true } });
    });

    test("query with where clause", async () => {
      const admins = await engine.query(AcmeUser)
        .where("isAdmin", "=", true)
        .select("name");

      expect(admins.length).toBe(2);
      expect(admins.map(a => a.fields.name).sort()).toEqual(["Alice", "Charlie"]);
    });

    test("query with limit", async () => {
      const users = await engine.query(AcmeUser)
        .limit(2)
        .select("name");

      expect(users.length).toBe(2);
    });

    test("query with orderBy", async () => {
      const users = await engine.query(AcmeUser)
        .orderBy("age", "desc")
        .select("name", "age");

      expect(users[0].fields.name).toBe("Charlie");
      expect(users[0].fields.age).toBe(35);
    });

    test("query refs only", async () => {
      const refs = await engine.query(AcmeUser)
        .where("isAdmin", "=", false)
        .refs();

      expect(refs.length).toBe(1);
      expect(refs[0].id).toBe("u2");
    });

    test("query with contains", async () => {
      const users = await engine.query(AcmeUser)
        .where("name", "contains", "li")
        .select("name");

      expect(users.length).toBe(2); // Alice and Charlie
    });
  });
});
