/**
 * NodeHandle — A parent's opaque view of one managed node.
 *
 * The handle IS the protocol interface. Whether the node is in-process
 * (protocol is the real object) or remote (protocol is a proxy that
 * serializes over a transport) — the handle looks the same.
 *
 * Transport is NOT on the handle. It's an internal concern of the provider
 * that created the handle. InProcess providers pass the real object directly.
 * Remote providers build a proxy that uses transport internally.
 *
 * @typeParam R - The protocol the node exposes (R extends Supervised)
 * @typeParam TId - The parent-assigned identity type (e.g., InstallationId, WorkspaceId).
 *                  Defaults to string for generic infrastructure code.
 */

import type { Supervised } from "./supervised.js"
import type { ProviderKind } from "./node-provider.js"

export interface NodeHandle<R extends Supervised, TId extends string = string> {
  /** Parent-assigned identity. The node does not know this ID. */
  readonly id: TId

  /** Informational tag identifying the deployment strategy. Never branched on by Supervisor. */
  readonly providerKind: ProviderKind

  /** The typed protocol surface — real object (in-process) or proxy (remote). */
  readonly protocol: R
}
