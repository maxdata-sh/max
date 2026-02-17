/**
 * DefaultSupervisor — Simple in-memory Supervisor implementation.
 *
 * Holds a map of ChildHandles, delegates health checks to each child,
 * and aggregates the results. This is the standard Supervisor for both
 * WorkspaceMax and GlobalMax.
 */

import type {
  Supervised,
  Supervisor,
  ChildHandle,
  AggregateHealthStatus,
  HealthStatusKind,
} from "@max/core"
import { HealthStatus } from "@max/core"

export class DefaultSupervisor<R extends Supervised, TId extends string = string>
  implements Supervisor<R, TId>
{
  private readonly handles = new Map<TId, ChildHandle<R, TId>>()

  register(handle: ChildHandle<R, TId>): void {
    this.handles.set(handle.id, handle)
  }

  unregister(id: TId): void {
    this.handles.delete(id)
  }

  get(id: TId): ChildHandle<R, TId> | undefined {
    return this.handles.get(id)
  }

  list(): ChildHandle<R, TId>[] {
    return [...this.handles.values()]
  }

  async health(): Promise<AggregateHealthStatus> {
    const children = new Map<string, HealthStatus>()

    for (const [id, handle] of this.handles) {
      try {
        children.set(id, await handle.protocol.health())
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
