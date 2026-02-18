/**
 * InstallationMax — Is a single Max for a single connection.
 *
 * Implements InstallationClient.
 */

import {
  type Engine,
  HealthStatus,
  type InstallationScope,
  LifecycleManager,
  type Schema,
  type SeederAny,
  StartResult,
  StopResult
} from "@max/core";
import {type Installation} from "@max/connector";
import {SyncExecutor, type SyncHandle} from "@max/execution";
import type {ManagedInstallation} from "../project-manager/index.js";
import type {InstallationClient} from "../protocols/installation-client.js";


/** Lightweight snapshot of a running runtime, for listing/introspection. */
export interface InstallationRuntimeInfo {
  readonly info: ManagedInstallation;
  readonly startedAt: Date;
}

// ============================================================================
// Implementation
// ============================================================================

export interface InstallationMaxConstructable {
  installation: Installation;
  schema: Schema;
  seeder: SeederAny;
  engine: Engine
  syncExecutor: SyncExecutor
}


export class InstallationMax implements InstallationClient {
  private readonly config: InstallationMaxConstructable;

  lifecycle = LifecycleManager.auto(() => [
    this.config.installation,
    this.config.engine,
    this.config.syncExecutor
  ]);

  constructor(config: InstallationMaxConstructable) {
    this.config = config;
  }

  async schema(): Promise<Schema> {
    return this.config.schema;
  }

  get engine(): Engine<InstallationScope> {
    return this.config.engine
  }

  async sync(): Promise<SyncHandle> {
    const plan = await this.config.seeder.seed(
      this.config.installation.context as never,
      this.engine
    );
    return this.config.syncExecutor.execute(plan);
  }

  // --------------------------------------------------------------------------
  // Supervised (parent-facing boundary)
  // --------------------------------------------------------------------------

  async health() {
    return HealthStatus.healthy()
  }

  async start(): Promise<StartResult> {
    await this.lifecycle.start()
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    await this.lifecycle.stop()
    return StopResult.stopped()
  }

}
