/**
 * NodeHandle — A parent's opaque view of one managed node.
 *
 * The handle IS the client interface. Whether the node is in-process
 * (client is the real object) or remote (client is a proxy that
 * serializes over a transport) — the handle looks the same.
 *
 * Transport is NOT on the handle. It's an internal concern of the provider
 * that created the handle. InProcess providers pass the real object directly.
 * Remote providers build a proxy that uses transport internally.
 *
 * @typeParam R - The client the node exposes (R extends Supervised)
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

  /** The typed client surface — real object (in-process) or proxy (remote). */
  readonly client: R
}
