/**
 * GlobalMax — Entry point. Manages workspaces.
 *
 * Implements GlobalProtocol. The top of the federation hierarchy.
 * Currently implicit in the CLI — this makes it explicit.
 */

import {
  HealthStatus,
  StartResult,
  StopResult,
  type WorkspaceId,
  type Supervisor,
} from "@max/core"
import type { WorkspaceProtocol } from "../protocols/workspace-protocol.js"
import type { GlobalProtocol } from "../protocols/global-protocol.js"

export class GlobalMax implements GlobalProtocol {
  readonly workspaces: Supervisor<WorkspaceProtocol, WorkspaceId>

  constructor(workspaces: Supervisor<WorkspaceProtocol, WorkspaceId>) {
    this.workspaces = workspaces
  }

  workspace(id: WorkspaceId): WorkspaceProtocol | undefined {
    return this.workspaces.get(id)?.supervised
  }

  async health() {
    const aggregate = await this.workspaces.health()
    return HealthStatus[aggregate.status](
      aggregate.status !== "healthy"
        ? `${aggregate.children.size} workspace(s) checked`
        : undefined,
    )
  }

  async start(): Promise<StartResult> {
    const handles = this.workspaces.list()
    for (const handle of handles) {
      await handle.supervised.start()
    }
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    const handles = this.workspaces.list()
    for (let i = handles.length - 1; i >= 0; i--) {
      await handles[i].supervised.stop()
    }
    return StopResult.stopped()
  }
}
