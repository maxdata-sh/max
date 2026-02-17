/**
 * InstallationClient — The leaf node. One connector, one schema, one data store.
 *
 * This is the atomic unit of the federation hierarchy. Installations do the
 * actual work of syncing and querying. They cannot subdivide further.
 *
 * Extends Supervised — every installation exposes health/start/stop to its
 * parent (the workspace).
 */

import type { Engine, InstallationScope, Schema, Supervised } from "@max/core"
import type { SyncHandle } from "@max/execution"

export interface InstallationClient extends Supervised {
  /** The connector's entity schema. Static after initialization. */
  readonly schema: Schema

  /** Query engine for this installation's data. */
  readonly engine: Engine<InstallationScope>

  /** Kick off a sync. Seeds on first run, re-seeds on subsequent. */
  sync(): Promise<SyncHandle>
}
