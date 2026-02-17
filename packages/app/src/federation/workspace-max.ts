/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceClient. This is what the current MaxProjectApp evolves
 * toward — the protocol-compliant workspace node in the federation hierarchy.
 *
 * Holds a Supervisor over installations. How those installations get created
 * and registered is the concern of ChildProviders (Phase 5) and the
 * composition root (Phase 6).
 */

import {
  HealthStatus,
  StartResult,
  StopResult,
  type InstallationId,
  type Supervisor,
} from "@max/core"
import type { InstallationClient } from "../protocols/installation-client.js"
import type { WorkspaceClient } from "../protocols/workspace-client.js"

export class WorkspaceMax implements WorkspaceClient {
  readonly installations: Supervisor<InstallationClient, InstallationId>

  constructor(installations: Supervisor<InstallationClient, InstallationId>) {
    this.installations = installations
  }

  installation(id: InstallationId): InstallationClient | undefined {
    return this.installations.get(id)?.client
  }

  async health() {
    const aggregate = await this.installations.health()
    return HealthStatus[aggregate.status](
      aggregate.status !== "healthy"
        ? `${aggregate.children.size} installation(s) checked`
        : undefined,
    )
  }

  async start(): Promise<StartResult> {
    const handles = this.installations.list()
    for (const handle of handles) {
      await handle.client.start()
    }
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    const handles = this.installations.list()
    // Stop in reverse registration order
    for (let i = handles.length - 1; i >= 0; i--) {
      await handles[i].client.stop()
    }
    return StopResult.stopped()
  }
}
