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
import { ConnectorModule } from "../connector-module.js";
import { Installation } from "../installation.js";
import { Credential } from "../credential.js";
import { CredentialProvider } from "../credential-provider.js";
import { StubbedCredentialStore } from "../credential-store.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const TestUser = EntityDef.create("TestUser", {
  name: Field.string(),
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
  async seed() { return SyncPlan.create([]); },
});

const testLoader = Loader.entity({
  name: "test:user:basic" as LoaderName,
  context: TestContext,
  entity: TestUser,
  strategy: "autoload",
  async load() { throw new Error("stub"); },
});

const testResolver = Resolver.for(TestUser, {
  name: testLoader.field("name"),
});

const ApiToken = Credential.string("api_token");

const testDef = ConnectorDef.create({
  name: "test",
  displayName: "Test",
  description: "A test connector",
  icon: "https://example.com/icon.svg",
  version: "1.0.0",
  scopes: ["read"],
  schema: testSchema,
  seeder: testSeeder,
  resolvers: [testResolver],
});

// ============================================================================
// Tests
// ============================================================================

describe("Installation", () => {
  test("create with defaults", async () => {
    const inst = Installation.create({ context: { apiKey: "test" } });

    expect(inst.context).toEqual({ apiKey: "test" });
    await inst.start();
    await inst.stop();
    expect(await inst.health()).toEqual({ status: "healthy" });
  });

  test("create with custom lifecycle", async () => {
    let started = false;
    let stopped = false;

    const inst = Installation.create({
      context: {},
      async start() { started = true; },
      async stop() { stopped = true; },
      async health() { return { status: "degraded", reason: "test" }; },
    });

    await inst.start();
    expect(started).toBe(true);

    await inst.stop();
    expect(stopped).toBe(true);

    expect(await inst.health()).toEqual({ status: "degraded", reason: "test" });
  });
});

describe("ConnectorModule", () => {
  test("create and initialise", () => {
    const mod = ConnectorModule.create({
      def: testDef,
      initialise(config: { workspace: string }, credentials) {
        return Installation.create({
          context: { workspace: config.workspace },
        });
      },
    });

    expect(mod.def).toBe(testDef);
    expect(mod.def.name).toBe("test");

    const store = new StubbedCredentialStore({ api_token: "sk-123" });
    const provider = CredentialProvider.create(store);
    const inst = mod.initialise({ workspace: "ws-1" }, provider);

    expect(inst.context).toEqual({ workspace: "ws-1" });
  });

  test("initialise with credential provider", async () => {
    const mod = ConnectorModule.create({
      def: testDef,
      initialise(config: { workspace: string }, credentials) {
        const apiKey = credentials.get(ApiToken);
        return Installation.create({
          context: { apiKeyHandle: apiKey },
        });
      },
    });

    const store = new StubbedCredentialStore({ api_token: "sk-test" });
    const provider = CredentialProvider.create(store);
    const inst = mod.initialise({ workspace: "ws-1" }, provider);

    const handle = (inst.context as any).apiKeyHandle;
    expect(await handle.get()).toBe("sk-test");
  });
});
