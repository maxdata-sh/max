import type { InstallationId, NodeProvider } from '@max/core'
import type { CreateInstallationConfig, InstallationClient } from '../protocols/index.js'

/** Provides Installation nodes.
 *  Real implementations include in-process, subprocess, docker etc.
 * */
export interface InstallationNodeProvider<TConfig = unknown> extends NodeProvider<
  InstallationClient,
  InstallationId,
  TConfig
> {}
