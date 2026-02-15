/**
 * InstallationRuntime — Per-installation container for all runtime state.
 *
 * Holds DB, engine, executor, and connector lifecycle.
 * Operations like sync become a single method call on a warm runtime.
 */

import { NoOpFlowController, type Engine, type SeederAny } from "@max/core";
import { CredentialProvider, type ConnectorRegistry, type Installation } from "@max/connector";
import { SyncExecutor, type SyncHandle } from "@max/execution";
import { DefaultTaskRunner, ExecutionRegistryImpl } from "@max/execution-local";
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from "@max/execution-sqlite";
import { SqliteEngine } from "@max/storage-sqlite";
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
    await this.config.engine.close();
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

    // 6. Open SQLite DB + engine
    const dbPath = projectManager.dataPathFor(managed);
    const engine = SqliteEngine.open(dbPath, mod.def.schema);

    // 7. Ensure execution tables + stores
    new SqliteExecutionSchema().ensureTables(engine.db);
    const syncMeta = new SqliteSyncMeta(engine.db);
    const taskStore = new SqliteTaskStore(engine.db);

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
      engine,
      seeder: mod.def.seeder,
      executor,
      startedAt: new Date(),
    });
  }
}
