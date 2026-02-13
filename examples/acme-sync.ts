/**
 * Syncs an Acme installation into a local SQLite database.
 *
 * Usage: bun run examples/acme-sync.ts
 */

import { Database } from "bun:sqlite";
import { Context, NoOpFlowController } from "@max/core";
import { SqliteEngine, SqliteSchema } from "@max/storage-sqlite";
import { SqliteExecutionSchema, SqliteTaskStore, SqliteSyncMeta } from "@max/execution-sqlite";
import { DefaultTaskRunner, ExecutionRegistryImpl } from "@max/execution-local";
import { SyncExecutor } from "@max/execution";
import AcmeConnector, {
  AcmeRoot,
  AcmeUser,
  AcmeTeam,
  AcmeAppContext,
  AcmeRootResolver,
  AcmeUserResolver,
  AcmeTeamResolver,
  AcmeSeeder,
  AcmeApiClientStub, AcmeSchema,
} from "@max/connector-acme";

// -- Config --
const DB_PATH = "acme.db";
const NUM_USERS = 50;
const NUM_TEAMS = 5;

// -- Setup database --
const db = new Database(DB_PATH);

const schema = new SqliteSchema().registerSchema(AcmeSchema)

schema.ensureTables(db);
new SqliteExecutionSchema().ensureTables(db);

const engine = new SqliteEngine(db, schema);
const syncMeta = new SqliteSyncMeta(db);
const taskStore = new SqliteTaskStore(db);

// -- Setup API stub --
const api = new AcmeApiClientStub({ users: NUM_USERS, teams: NUM_TEAMS });

// -- Wire up executor --
const registry = new ExecutionRegistryImpl(AcmeConnector.def.resolvers);
const taskRunner = new DefaultTaskRunner({
  engine,
  syncMeta,
  registry,
  flowController: new NoOpFlowController(),
  contextProvider: async () => Context.build(AcmeAppContext, { api, installationId: "acme-1" }),
});
const executor = new SyncExecutor({ taskRunner, taskStore });

// -- Seed and sync --
console.log(`Syncing ${NUM_USERS} users across ${NUM_TEAMS} teams into ${DB_PATH}...`);

const ctx = await Context.build(AcmeAppContext, { api, installationId: "acme-1" } as any);
console.log("  Seeding...");
const plan = await AcmeSeeder.seed(ctx as any, engine);
console.log(`  Plan: ${plan.steps.length} steps`);
const handle = await executor.execute(plan);
console.log(`  Sync started (${handle.id}), draining tasks...`);
const result = await handle.completion();

// -- Report --
const userCount = (db.query("SELECT COUNT(*) as n FROM _acme_user").get() as { n: number }).n;
const teamCount = (db.query("SELECT COUNT(*) as n FROM _acme_team").get() as { n: number }).n;
const taskCount = (db.query("SELECT COUNT(*) as n FROM _max_tasks").get() as { n: number }).n;
const metaCount = (db.query("SELECT COUNT(*) as n FROM _max_sync_meta").get() as { n: number }).n;

console.log(`\nSync ${result.status} in ${result.duration}ms`);
console.log(`  Users:      ${userCount}`);
console.log(`  Teams:      ${teamCount}`);
console.log(`  Tasks run:  ${taskCount}`);
console.log(`  Sync meta:  ${metaCount} entries`);
console.log(`\nDatabase written to ${DB_PATH}`);

db.close();
