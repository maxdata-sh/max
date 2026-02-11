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
import { ConnectorModule, type ConnectorModuleAny } from "../connector-module.js";
import { Installation } from "../installation.js";
import { ConnectorRegistry } from "../connector-registry.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const TestUser = EntityDef.create("TestUser", { name: Field.string() });
const TestRoot = EntityDef.create("TestRoot", { users: Field.collection(TestUser) });

class TestContext extends Context { key = Context.string; }

const testSchema = Schema.create({
  namespace: "test",
  entities: [TestUser, TestRoot],
  roots: [TestRoot],
});

const testSeeder = Seeder.create({
  context: TestContext,
  async seed() { return SyncPlan.create([]); },
});

const testLoader = Loader.entity({
  name: "test:user:basic" as LoaderName,
  context: TestContext,
  entity: TestUser,
  strategy: "autoload",
  async load() { throw new Error("stub"); },
});

function makeModule(name: string): ConnectorModuleAny {
  const def = ConnectorDef.create({
    name,
    displayName: name,
    description: `${name} connector`,
    icon: "",
    version: "1.0.0",
    scopes: [],
    schema: testSchema,
    seeder: testSeeder,
    resolvers: [Resolver.for(TestUser, { name: testLoader.field("name") })],
  });

  return ConnectorModule.create({
    def,
    initialise() { return Installation.create({ context: {} }); },
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("ConnectorRegistry", () => {
  test("addLocalNamed and resolve", async () => {
    const registry = ConnectorRegistry.create();
    const mod = makeModule("acme");

    registry.addLocalNamed("acme", async () => ({ default: mod }));

    const resolved = await registry.resolve("acme");
    expect(resolved).toBe(mod);
    expect(resolved.def.name).toBe("acme");
  });

  test("resolve caches modules", async () => {
    let loadCount = 0;
    const mod = makeModule("acme");
    const registry = ConnectorRegistry.create();

    registry.addLocalNamed("acme", async () => {
      loadCount++;
      return { default: mod };
    });

    await registry.resolve("acme");
    await registry.resolve("acme");
    expect(loadCount).toBe(1);
  });

  test("resolve throws for unknown connector", async () => {
    const registry = ConnectorRegistry.create();
    expect(registry.resolve("nope")).rejects.toThrow(
      'Connector "nope" not found in registry'
    );
  });

  test("addLocalNamed throws for duplicate name", () => {
    const registry = ConnectorRegistry.create();
    registry.addLocalNamed("acme", async () => ({ default: makeModule("acme") }));

    expect(() =>
      registry.addLocalNamed("acme", async () => ({ default: makeModule("acme") }))
    ).toThrow('Connector "acme" is already registered');
  });

  test("list returns registered names without loading", () => {
    const registry = ConnectorRegistry.create();
    registry.addLocalNamed("linear", async () => ({ default: makeModule("linear") }));
    registry.addLocalNamed("gdrive", async () => ({ default: makeModule("gdrive") }));

    const entries = registry.list();
    expect(entries).toEqual([
      { name: "linear", source: "local" },
      { name: "gdrive", source: "local" },
    ]);
  });
});
