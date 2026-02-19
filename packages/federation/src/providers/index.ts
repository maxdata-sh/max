/**
 * Providers — Deployment strategy implementations.
 *
 * Each provider is a stateless factory that creates or connects to
 * Max nodes using a specific technology. Providers return unlabelled
 * handles — the Supervisor assigns identity.
 */

export {
  InProcessInstallationProvider,
  InProcessWorkspaceProvider,
  type InProcessWorkspaceConfig,
} from "./in-process-provider.js"

export {
  BunInProcessInstallationProvider,
  SubprocessInstallationProvider,
} from "@max/platform-bun"

export type { InstallationNodeProvider } from './installation-node-provider.js'
export type { WorkspaceNodeProvider } from './workspace-node-provider.js'
