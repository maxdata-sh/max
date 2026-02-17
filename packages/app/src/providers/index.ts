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
