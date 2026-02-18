import type { InstallationId, Supervisor, WorkspaceId } from '@max/core'
import type { InstallationClient, WorkspaceClient } from '../protocols/index.js'

export interface InstallationSupervisor extends Supervisor<InstallationClient, InstallationId> {}
export interface WorkspaceSupervisor extends Supervisor<WorkspaceClient, WorkspaceId> {}
