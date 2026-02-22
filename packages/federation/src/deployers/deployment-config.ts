import { InstallationSpec } from '../config/installation-spec.js'
import { WorkspaceSpec } from '../config/workspace-spec.js'
import { UnknownConfig } from '../platform/index.js'
import { DeployerKind } from '@max/core'

export type DeployableSpec = InstallationSpec | WorkspaceSpec

/** These are determined by the platform */
export interface DeploymentConfig extends UnknownConfig {
  strategy: DeployerKind
}
