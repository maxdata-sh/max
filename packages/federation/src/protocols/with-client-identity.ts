import { InstallationId, MaxUrl, MaxUrlLevel, WorkspaceId } from '@max/core'
import { GlobalClient } from './global-client.js'
import { WorkspaceClient } from './workspace-client.js'
import { InstallationClient } from './installation-client.js'

// TODO: We'd probably benefit from a more general purpose "LevelContext<T>" interface than what we're doing piecemeal atm.
type IdTypeLUM = {
  global: '@'
  workspace: WorkspaceId
  installation: InstallationId
}

type ClientTypeLUM = {
  global: GlobalClient
  workspace: WorkspaceClientWithIdentity
  installation: InstallationClientWithIdentity
}

export type IdForLevel<TLevel extends MaxUrlLevel> = IdTypeLUM[TLevel]

/** Clients wrappers should extend this interface if they expose a client id */
export interface WithClientIdentity<TLevel extends MaxUrlLevel> {
  id: IdForLevel<TLevel>
  // FIXME: ^ This should actually be a Locator, not an id
  // Thought: It would be _nice_ to put a maxUrl on this point of the interface,
  // however, federated nodes don't know their own url - which means that
  // we can't reliably create downstream MaxUrls for children (right now),
  // because there's no such concept as a "partial" MaxUrl. That is, all
  // MaxUrls are "complete". There is a soft design tension here to introduce a
  // url structure that works backwards as well as forwards. It could simply be
  // that @ represents "me" rather than "global" - in which case, children of me
  // would be max://@/{child}. This would work... but we'd need to establish a
  // clear "global" convention that sits outside of it. Perhaps that's as simple
  // as "localhost" (not keen) or three slashes ///?
}

/** This represents a client for the given level that has an id bound into it */
export type ClientWithIdentity<TLevel extends MaxUrlLevel> = ClientTypeLUM[TLevel]

export interface InstallationClientWithIdentity
  extends InstallationClient, WithClientIdentity<'installation'> {}

export interface WorkspaceClientWithIdentity
  extends WorkspaceClient, WithClientIdentity<'workspace'> {}

export interface GlobalClientWithIdentity
  extends GlobalClient, WithClientIdentity<'global'> {}
