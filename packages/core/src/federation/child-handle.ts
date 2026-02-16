/**
 * ChildHandle — A parent's opaque view of one managed child.
 *
 * Encapsulates deployment details. Whether the child is in-process, a local
 * Bun process, a Docker container, or a remote server — the handle looks
 * the same.
 *
 * The parent works exclusively with ChildHandles. It never sees the child's
 * internal implementation.
 *
 * @typeParam R - The supervised interface the child exposes (R extends Supervised)
 * @typeParam TId - The parent-assigned identity type (e.g., InstallationId, WorkspaceId).
 *                  Defaults to string for generic infrastructure code.
 */

import type { Supervised } from "./supervised.js"
import type { Transport } from "./transport.js"
import type { ProviderKind } from "./child-provider.js"

export interface ChildHandle<R extends Supervised, TId extends string = string> {
  /** Parent-assigned identity. The child does not know this ID. */
  readonly id: TId

  /** Informational tag identifying the deployment strategy. Never branched on by Supervisor. */
  readonly providerKind: ProviderKind

  /** Health + lifecycle interface. R extends Supervised. */
  readonly supervised: R

  /** Message passing to this child. Untyped at this layer; protocol layer adds type safety. */
  readonly transport: Transport
}
