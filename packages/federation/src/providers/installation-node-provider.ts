import type { NodeProvider } from '@max/core'
import type { InstallationClient } from '../protocols/index.js'

/** Provides Installation nodes.
 *  Real implementations include in-process, subprocess, docker etc.
 * */
export interface InstallationNodeProvider<TConfig = unknown> extends NodeProvider<
  InstallationClient,
  TConfig
> {}
