import {
  GlobalClientWithIdentity,
  InstallationClientWithIdentity,
  WorkspaceClientWithIdentity,
} from '../protocols/with-client-identity.js'
import { InstallationId, WorkspaceId } from '@max/core'

export interface MaxClientResolver {
  global: () => GlobalClientWithIdentity
  workspace: (nameOrId: WorkspaceId | string) => WorkspaceClientWithIdentity | undefined
  installation: (nameOrId: InstallationId | string, workspace: WorkspaceClientWithIdentity) => Promise<InstallationClientWithIdentity | undefined>
}
