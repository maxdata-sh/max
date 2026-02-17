/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceClient. Holds a Supervisor internally (not exposed on
 * the client surface). Real implementation of listInstallations,
 * createInstallation, and removeInstallation requires a Registry and
 * NodeProvider wiring — deferred to a follow-up task.
 */

import {
  ErrNotImplemented,
  HealthStatus,
  StartResult,
  StopResult,
  type InstallationId,
  type Supervisor,
} from "@max/core"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { CreateInstallationConfig, WorkspaceClient } from "../protocols/workspace-client.js"
import type { InstallationInfo } from "../project-manager/types.js"

export class WorkspaceMax implements WorkspaceClient {
  private readonly supervisor: Supervisor<InstallationClient, InstallationId>

  constructor(installations: Supervisor<InstallationClient, InstallationId>) {
    this.supervisor = installations
  }

  async listInstallations(): Promise<InstallationInfo[]> {
    throw ErrNotImplemented.create({}, "WorkspaceMax.listInstallations requires Registry")
  }

  installation(id: InstallationId): InstallationClient | undefined {
    return this.supervisor.get(id)?.client
  }

  async createInstallation(_config: CreateInstallationConfig): Promise<InstallationId> {
    throw ErrNotImplemented.create({}, "WorkspaceMax.createInstallation requires NodeProvider wiring")
  }

  async removeInstallation(_id: InstallationId): Promise<void> {
    throw ErrNotImplemented.create({}, "WorkspaceMax.removeInstallation requires NodeProvider wiring")
  }

  async health() {
    const aggregate = await this.supervisor.health()
    return HealthStatus[aggregate.status](
      aggregate.status !== "healthy"
        ? `${aggregate.children.size} installation(s) checked`
        : undefined,
    )
  }

  async start(): Promise<StartResult> {
    const handles = this.supervisor.list()
    for (const handle of handles) {
      await handle.client.start()
    }
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    const handles = this.supervisor.list()
    for (let i = handles.length - 1; i >= 0; i--) {
      await handles[i].client.stop()
    }
    return StopResult.stopped()
  }
}
