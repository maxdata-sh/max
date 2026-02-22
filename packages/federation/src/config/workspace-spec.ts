/**
 * WorkspaceSpec — Provider-agnostic description of what a workspace needs to be.
 *
 * This describes the desired state of a workspace: which connector, what engine,
 * what credential store. It says nothing about *how* the workspace is hosted.
 *
 * Each layer reads only the config it owns. Providers pass spec through to the node
 * without interpreting it. The node uses spec to wire its own internals.
 */
import {InstallationRegistryConfig} from "./installation-registry.js";

// ============================================================================
// WorkspaceSpec
// ============================================================================

export type WorkspaceEngineConfig =
  | { type: 'simple' }

export interface WorkspaceSpec {
  readonly name: string

  // FIXME: This shouldn't live here, it should live in the deployment config
  readonly installationRegistry?: InstallationRegistryConfig

}
