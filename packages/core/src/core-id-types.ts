import type { Id } from './brand.js'

export type EntityType = Id<'entity-type'>
export type EntityId = Id<'entity-id'>
export type InstallationId = Id<'installation-id'>
export type WorkspaceId = Id<'workspace-id'>

/** Identifies a connector: @max/connector-acme:1.0.1 */
export type ConnectorVersionIdentifier = Id<'connector-version-identifier'>
