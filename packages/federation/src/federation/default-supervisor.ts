/**
 * DefaultSupervisor — Simple in-memory Supervisor implementation.
 *
 * Holds a map of NodeHandles, delegates health checks to each child,
 * and aggregates the results. This is the standard Supervisor for both
 * WorkspaceMax and GlobalMax.
 *
 * Accepts an IdGenerator to assign identity when registering unlabelled handles.
 */

import type {
  Supervised,
  Supervisor,
  NodeHandle,
  UnlabelledHandle,
  IdGenerator,
  AggregateHealthStatus,
  HealthStatusKind,
} from "@max/core"
import { HealthStatus } from "@max/core"

export class DefaultSupervisor<R extends Supervised, TId extends string = string>
  implements Supervisor<R, TId>
{
  private readonly handles = new Map<TId, NodeHandle<R, TId>>()
  private readonly idGenerator: IdGenerator<TId>

  constructor(idGenerator: IdGenerator<TId>) {
    this.idGenerator = idGenerator
  }

  register(handle: UnlabelledHandle<R>, id?: TId): NodeHandle<R, TId> {
    const assignedId = id ?? this.idGenerator()
    const labelled: NodeHandle<R, TId> = {
      id: assignedId,
      deployerKind: handle.deployerKind,
      client: handle.client,
    }
    this.handles.set(assignedId, labelled)
    return labelled
  }

  unregister(id: TId): void {
    this.handles.delete(id)
  }

  get(id: TId): NodeHandle<R, TId> | undefined {
    return this.handles.get(id)
  }

  list(): NodeHandle<R, TId>[] {
    return [...this.handles.values()]
  }

  async health(): Promise<AggregateHealthStatus> {
    const children = new Map<string, HealthStatus>()

    for (const [id, handle] of this.handles) {
      try {
        children.set(id, await handle.client.health())
      } catch {
        children.set(id, HealthStatus.unhealthy("unreachable"))
      }
    }

    const statuses = [...children.values()].map((h) => h.status)
    let status: HealthStatusKind

    if (statuses.length === 0 || statuses.every((s) => s === "healthy")) {
      status = "healthy"
    } else if (statuses.every((s) => s === "unhealthy")) {
      status = "unhealthy"
    } else {
      status = "degraded"
    }

    return { status, children }
  }
}
