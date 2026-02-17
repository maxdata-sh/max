/**
 * WorkspaceMax — Manages installations. Provides cross-installation operations.
 *
 * Implements WorkspaceProtocol. This is what the current MaxProjectApp evolves
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
import type { InstallationProtocol } from "../protocols/installation-protocol.js"
import type { WorkspaceProtocol } from "../protocols/workspace-protocol.js"

export class WorkspaceMax implements WorkspaceProtocol {
  readonly installations: Supervisor<InstallationProtocol, InstallationId>

  constructor(installations: Supervisor<InstallationProtocol, InstallationId>) {
    this.installations = installations
  }

  installation(id: InstallationId): InstallationProtocol | undefined {
    return this.installations.get(id)?.protocol
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
      await handle.protocol.start()
    }
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    const handles = this.installations.list()
    // Stop in reverse registration order
    for (let i = handles.length - 1; i >= 0; i--) {
      await handles[i].protocol.stop()
    }
    return StopResult.stopped()
  }
}
