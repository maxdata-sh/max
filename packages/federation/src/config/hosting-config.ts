/**
 * HostingConfig — How an installation should be hosted.
 *
 * Each variant corresponds to a provider type. The `type` field is the
 * discriminant that routes to the correct provider at the workspace level.
 *
 * Hosting is orthogonal to the installation spec. The spec says *what*,
 * hosting says *where*.
 */

// ============================================================================
// Hosting variants
// ============================================================================

export interface InProcessHostingConfig {
  readonly type: "in-process"
}

export interface SubprocessHostingConfig {
  readonly type: "subprocess"
  readonly workingDir?: string
}

export interface DockerHostingConfig {
  readonly type: "docker"
  readonly image: string
  readonly resources?: { cpu?: string; memory?: string }
}

export interface RemoteHostingConfig {
  readonly type: "remote"
  readonly url: string
}

// ============================================================================
// Union + discriminant
// ============================================================================

export type HostingConfig =
  | InProcessHostingConfig
  | SubprocessHostingConfig
  | DockerHostingConfig
  | RemoteHostingConfig

/** The discriminant values of HostingConfig. Used as map keys for provider routing. */
export type HostingType = HostingConfig["type"]
