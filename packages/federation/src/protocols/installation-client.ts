/**
 * InstallationClient — The leaf node. One connector, one schema, one data store.
 *
 * This is the atomic unit of the federation hierarchy. Installations do the
 * actual work of syncing and querying. They cannot subdivide further.
 *
 * Extends Supervised — every installation exposes health/start/stop to its
 * parent (the workspace).
 */

import type { ConnectorVersionIdentifier, Engine, InstallationScope, Schema, Supervised } from "@max/core"
import type { SyncHandle, SyncObserver } from "@max/execution"

/**
 * Self-reported metadata from a running installation node.
 * Lightweight — no I/O, just surfaces what the node already knows.
 */
export interface InstallationDescription {
  readonly connector: ConnectorVersionIdentifier
  readonly name: string
  readonly schema: Schema
}

export interface InstallationClient extends Supervised {
  /** Self-describe: what connector, what name, what schema. */
  describe(): Promise<InstallationDescription>

  /** The connector's entity schema. Can be cached after first retrieval. */
  schema(): Promise<Schema>

  /** Query engine for this installation's data. */
  readonly engine: Engine<InstallationScope>

  /** Kick off a sync. Seeds on first run, re-seeds on subsequent. */
  sync(options?: { observer?: SyncObserver }): Promise<SyncHandle>
}
