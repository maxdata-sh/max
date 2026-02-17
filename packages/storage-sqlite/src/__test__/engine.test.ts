/**
 * Basic e2e tests for SqliteEngine.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Fields, Query } from "@max/core";
import {AcmeUser, AcmeWorkspace, AcmeProject, AcmeSchema} from "@max/connector-acme";
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
    schema = new SqliteSchema().registerSchema(AcmeSchema)
    schema.ensureTables(db);
    engine = new SqliteEngine(db, schema);
  });

  describe("store and load", () => {
    test("store and load a simple entity", async () => {
      // Store
      const ref = await engine.store({
        ref: AcmeUser.ref("u1"),
        fields: {
          displayName: "Alice",
          email: "alice@example.com",
          role: "admin",
          active: true,
        },
      });

      expect(ref.id).toBe("u1");

      // Load all fields
      const result = await engine.load(ref, Fields.ALL);

      expect(result.fields.displayName).toBe("Alice");
      expect(result.fields.email).toBe("alice@example.com");
      expect(result.fields.role).toBe("admin");
      expect(result.fields.active).toBe(true);
    });

    test("load specific fields", async () => {
      await engine.store({
        ref: AcmeUser.ref("u2"),
        fields: {
          displayName: "Bob",
          email: "bob@example.com",
          role: "member",
          active: false,
        },
      });

      const result = await engine.load(AcmeUser.ref("u2"), Fields.select("displayName", "email"));

      expect(result.fields.displayName).toBe("Bob");
      expect(result.fields.email).toBe("bob@example.com");
      // role and active not loaded
      expect(result.has("role")).toBe(false);
    });

    test("store and load with ref field", async () => {
      await engine.store({
        ref: AcmeUser.ref("owner1"),
        fields: { displayName: "Owner", email: "owner@example.com", role: "admin", active: true },
      });

      await engine.store({
        ref: AcmeProject.ref("proj1"),
        fields: {
          name: "Engineering",
          description: "The engineering project",
          status: "active",
          owner: AcmeUser.ref("owner1"),
        },
      });

      const project = await engine.load(AcmeProject.ref("proj1"), Fields.ALL);

      expect(project.fields.name).toBe("Engineering");
      expect(project.fields.owner.id).toBe("owner1");
      expect(project.fields.owner.entityType).toBe("AcmeUser");
    });

    test("upsert updates existing entity", async () => {
      await engine.store({
        ref: AcmeUser.ref("u3"),
        fields: { displayName: "Charlie", email: "charlie@example.com", role: "member", active: false },
      });

      // Update
      await engine.store({
        ref: AcmeUser.ref("u3"),
        fields: { displayName: "Charles", email: "charles@example.com", role: "admin", active: true },
      });

      const result = await engine.load(AcmeUser.ref("u3"), Fields.ALL);

      expect(result.fields.displayName).toBe("Charles");
      expect(result.fields.role).toBe("admin");
    });
  });

  describe("loadField", () => {
    test("load a single field", async () => {
      await engine.store({
        ref: AcmeUser.ref("u4"),
        fields: { displayName: "Diana", email: "diana@example.com", role: "viewer", active: true },
      });

      const displayName = await engine.loadField(AcmeUser.ref("u4"), "displayName");
      expect(displayName).toBe("Diana");

      const active = await engine.loadField(AcmeUser.ref("u4"), "active");
      expect(active).toBe(true);
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      await engine.store({ ref: AcmeUser.ref("u1"), fields: { displayName: "Alice", email: "a@test.com", role: "admin", active: true } });
      await engine.store({ ref: AcmeUser.ref("u2"), fields: { displayName: "Bob", email: "b@test.com", role: "member", active: false } });
      await engine.store({ ref: AcmeUser.ref("u3"), fields: { displayName: "Charlie", email: "c@test.com", role: "admin", active: true } });
    });

    test("query with where clause", async () => {
      const admins = await engine.query(
        Query.from(AcmeUser).where("active", "=", true).select("displayName")
      );

      expect(admins.items.length).toBe(2);
      expect(admins.items.map(a => a.fields.displayName).sort()).toEqual(["Alice", "Charlie"]);
    });

    test("query with limit", async () => {
      const users = await engine.query(
        Query.from(AcmeUser).limit(2).select("displayName")
      );

      expect(users.items.length).toBe(2);
      expect(users.hasMore).toBe(true);
    });

    test("query with orderBy", async () => {
      const users = await engine.query(
        Query.from(AcmeUser).orderBy("displayName", "desc").select("displayName", "email")
      );

      expect(users.items[0].fields.displayName).toBe("Charlie");
    });

    test("query refs only", async () => {
      const refs = await engine.query(
        Query.from(AcmeUser).where("active", "=", false).refs()
      );

      expect(refs.items.length).toBe(1);
      expect(refs.items[0].id).toBe("u2");
    });

    test("query with contains", async () => {
      const users = await engine.query(
        Query.from(AcmeUser).where("displayName", "contains", "li").select("displayName")
      );

      expect(users.items.length).toBe(2); // Alice and Charlie
    });

    test("query selectAll", async () => {
      const all = await engine.query(
        Query.from(AcmeUser).selectAll()
      );

      expect(all.items.length).toBe(3);
      expect(all.hasMore).toBe(false);
    });

    test("query pagination hasMore is false when all results fit", async () => {
      const users = await engine.query(
        Query.from(AcmeUser).limit(10).select("displayName")
      );

      expect(users.items.length).toBe(3);
      expect(users.hasMore).toBe(false);
    });
  });
});
