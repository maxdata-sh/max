/**
 * Providers — Deployment strategy implementations.
 *
 * Each provider knows how to host, supervise, and communicate with
 * Max nodes using a specific technology.
 */

export {
  InProcessInstallationProvider,
  InProcessWorkspaceProvider,
  type InProcessInstallationDeps,
  type InProcessWorkspaceConfig,
} from "./in-process-provider.js"

export {
  SubprocessInstallationProvider,
  type SubprocessInstallationConfig,
} from "./subprocess-installation-provider.js"

export type { InstallationNodeProvider } from './installation-node-provider.js'
export type { WorkspaceNodeProvider } from './workspace-node-provider.js'
