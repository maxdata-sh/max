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

import type { Supervised } from './supervised.js'
import { DeployerKind } from './deployer.js'
import { StaticTypeCompanion } from '../companion.js'
import {Id} from "../brand.js";

/**
 * UnlabelledHandle — What a provider returns. A live node without identity.
 *
 * The provider creates or connects to a node and returns this. It has no ID
 * because identity is assigned by the parent (via the Supervisor), not by
 * the provider.
 */
export interface UnlabelledHandle<R extends Supervised, TLocator extends Locator = Locator> {
  /** The typed client surface — real object (in-process) or proxy (remote). */
  readonly client: R

  /** Informational tag identifying the deployment strategy. */
  readonly deployerKind: DeployerKind

  readonly locator: TLocator
}

export const UnlabelledHandle = StaticTypeCompanion({
  create<R extends Supervised, TLocator extends Locator>(input: UnlabelledHandle<R,TLocator>): UnlabelledHandle<R,TLocator> {
    return input
  },
})

/**
 * NodeHandle — An unlabelled handle stamped with an ID by the parent.
 *
 * Created by the Supervisor when it registers an UnlabelledHandle.
 */
export interface NodeHandle<R extends Supervised, TId extends string = string> {
  /** Parent-assigned identity. The node does not know this ID. */
  readonly id: TId

  /** Informational tag identifying the deployment strategy. Never branched on by Supervisor. */
  readonly deployerKind: DeployerKind

  /** The typed client surface — real object (in-process) or proxy (remote). */
  readonly client: R
}

/**
 * IdGenerator — Produces parent-assigned identities.
 *
 * Injected into the Supervisor. Normal creation generates a new ID;
 * reconciliation passes a specific persisted ID instead.
 */
export type IdGenerator<TId extends string = string> = () => TId

// TODO: We'll introduce a proper Locator type. This is a standin that works
export interface Locator {
  readonly strategy: DeployerKind
}


/** This is a stand-in type for a well-formed locator URL that's coming later (e.g. max://-/path/to/resource).
 *  This exists here to scaffold out the stub-points that will want this information later
 */
export type LocatorURI = Id<'locator-string'>
export const LocatorURI = StaticTypeCompanion({
  create<TLocator extends Locator>(args:TLocator): LocatorURI {
    return JSON.stringify(args)
  },
  read(arg:LocatorURI): Locator { return JSON.parse(arg) }
})


export const Locator = StaticTypeCompanion({
  create<TLocator extends Locator>(args:TLocator): TLocator { return args},
  toURI: LocatorURI.create
})

