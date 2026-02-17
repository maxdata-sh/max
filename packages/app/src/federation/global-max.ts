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
import type { WorkspaceClient } from "../protocols/workspace-client.js"
import type { GlobalClient } from "../protocols/global-client.js"

export class GlobalMax implements GlobalClient {
  readonly workspaces: Supervisor<WorkspaceClient, WorkspaceId>

  constructor(workspaces: Supervisor<WorkspaceClient, WorkspaceId>) {
    this.workspaces = workspaces
  }

  workspace(id: WorkspaceId): WorkspaceClient | undefined {
    return this.workspaces.get(id)?.client
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
      await handle.client.start()
    }
    return StartResult.started()
  }

  async stop(): Promise<StopResult> {
    const handles = this.workspaces.list()
    for (let i = handles.length - 1; i >= 0; i--) {
      await handles[i].client.stop()
    }
    return StopResult.stopped()
  }
}
