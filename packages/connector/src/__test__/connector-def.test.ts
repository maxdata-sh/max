import { describe, test, expect } from "bun:test";
import {
  EntityDef,
  Field,
  Seeder,
  SyncPlan,
  Resolver,
  Loader,
  Context,
  Schema,
  type LoaderName,
} from "@max/core";
import { ConnectorDef } from "../connector-def.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const TestUser = EntityDef.create("TestUser", {
  name: Field.string(),
  email: Field.string(),
});

const TestRoot = EntityDef.create("TestRoot", {
  users: Field.collection(TestUser),
});

class TestContext extends Context {
  apiKey = Context.string;
}

const testSchema = Schema.create({
  namespace: "test",
  entities: [TestUser, TestRoot],
  roots: [TestRoot],
});

const testSeeder = Seeder.create({
  context: TestContext,
  async seed(_ctx, _engine) {
    return SyncPlan.create([]);
  },
});

const testUserLoader = Loader.entity({
  name: "test:user:basic" as LoaderName,
  context: TestContext,
  entity: TestUser,
  strategy: "autoload",
  async load(_ref, _ctx) {
    throw new Error("stub");
  },
});

const testResolver = Resolver.for(TestUser, {
  name: testUserLoader.field("name"),
  email: testUserLoader.field("email"),
});

// ============================================================================
// Tests
// ============================================================================

describe("ConnectorDef", () => {
  const def = ConnectorDef.create({
    name: "test",
    displayName: "Test Connector",
    description: "A test connector for unit tests",
    icon: "https://example.com/icon.svg",
    version: "1.0.0",
    scopes: ["read:users", "read:teams"],
    schema: testSchema,
    seeder: testSeeder,
    resolvers: [testResolver],
  });

  test("identity fields", () => {
    expect(def.name).toBe("test");
    expect(def.displayName).toBe("Test Connector");
    expect(def.description).toBe("A test connector for unit tests");
    expect(def.icon).toBe("https://example.com/icon.svg");
    expect(def.version).toBe("1.0.0");
  });

  test("schema", () => {
    expect(def.schema).toBe(testSchema);
    expect(def.schema.namespace).toBe("test");
  });

  test("scopes", () => {
    expect(def.scopes).toEqual(["read:users", "read:teams"]);
  });

  test("seeder", () => {
    expect(def.seeder).toBe(testSeeder);
  });

  test("resolvers", () => {
    expect(def.resolvers).toHaveLength(1);
    expect(def.resolvers[0]).toBe(testResolver);
  });

  test("scopes array is frozen", () => {
    expect(Object.isFrozen(def.scopes)).toBe(true);
  });

  test("resolvers array is frozen", () => {
    expect(Object.isFrozen(def.resolvers)).toBe(true);
  });
});
