/**
 * InstallationRuntime — Per-installation container for all runtime state.
 *
 * Holds DB, engine, executor, and connector lifecycle.
 * Operations like sync become a single method call on a warm runtime.
 */

import { LifecycleManager, NoOpFlowController, type Engine, type Lifecycle, type LifecycleMethods, type SeederAny } from "@max/core";
import { CredentialProvider, type ConnectorRegistry, type Installation } from "@max/connector";
import { SyncExecutor, type SyncHandle } from "@max/execution";
import { DefaultTaskRunner, ExecutionRegistryImpl } from "@max/execution-local";
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from "@max/execution-sqlite";
import { SqliteEngine } from "@max/storage-sqlite";
import type { ManagedInstallation, ProjectManager } from "../project-manager/index.js";

// ============================================================================
// InstallationRuntime Interface
// ============================================================================

export interface InstallationRuntime extends Lifecycle {
  /** Installation metadata (connector, name, id, connectedAt) */
  readonly info: ManagedInstallation;

  /** Query engine for this installation's data */
  readonly engine: Engine;

  /** Kick off a full sync. Seeds on first run, re-seeds on subsequent. */
  sync(): Promise<SyncHandle>;

  readonly startedAt: Date;
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

  lifecycle = LifecycleManager.auto(() => [
    this.config.installation,
    this.config.engine,
  ]);

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

    // Load installation from disk
    const managed = projectManager.get(connector, name);

    // Resolve connector module
    const mod = await connectorRegistry.resolve(connector);

    // Create credential provider
    const credStore = projectManager.credentialStoreFor(managed);
    const credentials = CredentialProvider.create(credStore);

    // Initialise connector → live Installation
    const installation = mod.initialise(managed.config, credentials);

    // Open SQLite DB + engine
    const dbPath = projectManager.dataPathFor(managed);
    const engine = SqliteEngine.open(dbPath, mod.def.schema);

    // FIXME: CLAUDE: This wiring should be something that lives in a static helper in execution-sqlite (a bit like sqliteengine above) - we shouldn't have to create these manually
    // Ensure execution tables + stores
    new SqliteExecutionSchema().ensureTables(engine.db);
    const syncMeta = new SqliteSyncMeta(engine.db);
    const taskStore = new SqliteTaskStore(engine.db);

    // Build execution registry from connector resolvers
    const registry = new ExecutionRegistryImpl(mod.def.resolvers);

    // Construct task runner
    const taskRunner = new DefaultTaskRunner({
      engine,
      syncMeta,
      registry,
      flowController: new NoOpFlowController(),
      contextProvider: async () => installation.context,
    });

    // Construct sync executor
    const executor = new SyncExecutor({ taskRunner, taskStore });

    const runtime = new InstallationRuntimeImpl({
      managed,
      installation,
      engine,
      seeder: mod.def.seeder,
      executor,
      startedAt: new Date(),
    });

    await runtime.lifecycle.start();
    return runtime;
  }
}
