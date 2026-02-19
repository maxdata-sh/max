import type { NodeProvider } from '@max/core'
import type { WorkspaceClient } from '../protocols/index.js'

/** Provides Workspace nodes.
 *  Real implementations include in-process, subprocess, docker etc.
 * */
export interface WorkspaceNodeProvider<TConfig = unknown> extends NodeProvider<
  WorkspaceClient,
  TConfig
> {}
