/**
 * InstallationRuntime — Per-installation container for all runtime state.
 *
 * Holds DB, engine, executor, and connector lifecycle.
 * Operations like sync become a single method call on a warm runtime.
 */

import { Database } from "bun:sqlite";
import { NoOpFlowController, type Engine, type SeederAny } from "@max/core";
import { CredentialProvider, type ConnectorRegistry, type Installation } from "@max/connector";
import { SyncExecutor, type SyncHandle } from "@max/execution";
import { DefaultTaskRunner, ExecutionRegistryImpl } from "@max/execution-local";
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from "@max/execution-sqlite";
import { SqliteEngine, SqliteSchema } from "@max/storage-sqlite";
import type { ManagedInstallation, ProjectManager } from "../project-manager/index.js";

// ============================================================================
// InstallationRuntime Interface
// ============================================================================

export interface InstallationRuntime {
  /** Installation metadata (connector, name, id, connectedAt) */
  readonly info: ManagedInstallation;

  /** Query engine for this installation's data */
  readonly engine: Engine;

  /** Kick off a full sync. Seeds on first run, re-seeds on subsequent. */
  sync(): Promise<SyncHandle>;

  /** Tear down: close DB, stop credential refresh, release resources. */
  stop(): Promise<void>;
}

/** Lightweight snapshot of a running runtime, for listing/introspection. */
export interface InstallationRuntimeInfo {
  readonly info: ManagedInstallation;
  readonly startedAt: Date;
}

// ============================================================================
// Implementation
// ============================================================================

interface InstallationRuntimeConfig {
  managed: ManagedInstallation;
  installation: Installation;
  db: Database;
  engine: SqliteEngine;
  seeder: SeederAny;
  executor: SyncExecutor;
  startedAt: Date;
}

export class InstallationRuntimeImpl implements InstallationRuntime {
  private readonly config: InstallationRuntimeConfig;

  constructor(config: InstallationRuntimeConfig) {
    this.config = config;
  }

  get info(): ManagedInstallation {
    return this.config.managed;
  }

  get engine(): Engine {
    return this.config.engine;
  }

  get startedAt(): Date {
    return this.config.startedAt;
  }

  async sync(): Promise<SyncHandle> {
    const plan = await this.config.seeder.seed(
      this.config.installation.context as never,
      this.config.engine,
    );
    return this.config.executor.execute(plan);
  }

  async stop(): Promise<void> {
    await this.config.installation.stop();
    this.config.db.close();
  }

  // --------------------------------------------------------------------------
  // Factory
  // --------------------------------------------------------------------------

  static async create(deps: {
    projectManager: ProjectManager;
    connectorRegistry: ConnectorRegistry;
    connector: string;
    name?: string;
  }): Promise<InstallationRuntimeImpl> {
    const { projectManager, connectorRegistry, connector, name } = deps;

    // 1. Load installation from disk
    const managed = projectManager.get(connector, name);

    // 2. Resolve connector module
    const mod = await connectorRegistry.resolve(connector);

    // 3-4. Create credential provider
    const credStore = projectManager.credentialStoreFor(managed);
    const credentials = CredentialProvider.create(credStore);

    // 5. Initialise connector → live Installation
    const installation = mod.initialise(managed.config, credentials);

    // 6-7. Open SQLite DB
    const dbPath = projectManager.dataPathFor(managed);
    const db = new Database(dbPath, { create: true });

    // 8. Register entity schema + ensure tables
    const schema = new SqliteSchema().registerSchema(mod.def.schema);
    schema.ensureTables(db);

    // 9. Ensure execution tables
    new SqliteExecutionSchema().ensureTables(db);

    // 10. Construct storage + execution stores
    const engine = new SqliteEngine(db, schema);
    const syncMeta = new SqliteSyncMeta(db);
    const taskStore = new SqliteTaskStore(db);

    // 11. Build execution registry from connector resolvers
    const registry = new ExecutionRegistryImpl(mod.def.resolvers);

    // 12. Construct task runner
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta,
      registry,
      flowController: new NoOpFlowController(),
      contextProvider: async () => installation.context,
    });

    // 13. Construct sync executor
    const executor = new SyncExecutor({ taskRunner, taskStore });

    // 14. Start connector lifecycle (credential refresh, etc.)
    await installation.start();

    return new InstallationRuntimeImpl({
      managed,
      installation,
      db,
      engine,
      seeder: mod.def.seeder,
      executor,
      startedAt: new Date(),
    });
  }
}
