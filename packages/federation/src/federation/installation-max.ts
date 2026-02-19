/**
 * InstallationMax — Is a single Max for a single connection.
 *
 * Implements InstallationClient.
 */

import {
  type ConnectorType,
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
import type {InstallationClient, InstallationDescription} from "../protocols/installation-client.js";

// ============================================================================
// Implementation
// ============================================================================

export interface InstallationMaxConstructable {
  connector: ConnectorType;
  name: string;
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

  async describe(): Promise<InstallationDescription> {
    return {
      connector: this.config.connector,
      name: this.config.name,
      schema: this.config.schema,
    }
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
