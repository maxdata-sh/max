import { InProcessLocator } from './general/inprocess-deployer'
import {DaemonLocator} from "./general/daemon-deployer.js";
import {DockerLocator} from "./general/docker-deployer.js";
import {RemoteLocator} from "./general/remote-deployer.js";
import {
  CredentialStoreConfig,
  DeploymentConfig,
  EngineConfig,
  SyncMetaConfig,
  TaskStoreConfig,
} from '@max/federation'
import {ConnectorRegistryConfig} from "@max/federation";

export type BunDeployerConfig =
  | { type: InProcessLocator['strategy']; dataDir: string }
  | { type: DaemonLocator['strategy']; dataDir: string; socketPath?: string }
  | { type: RemoteLocator['strategy']; url: string }
// | { type: DockerLocator['strategy']; image: string; volumes?: Record<string, string> }

export type BunLocator =
  | InProcessLocator
  | DaemonLocator
  | DockerLocator
  | RemoteLocator


// FIXME: This is being used as both installation and workspace config - but it shouldn't - we're unreasonably conflating the two
//  likewise with the configs below
export interface InProcessDeploymentConfig extends DeploymentConfig {
  strategy: 'in-process'
  dataDir: string
  engine?: EngineConfig // { type: "sqlite" } | { type: "indexeddb" } | ...
  credentials?: CredentialStoreConfig // { type: "fs", path?: string } | { type: "in-memory" }
  connectorRegistry?: ConnectorRegistryConfig
  taskStore?: TaskStoreConfig
  syncMeta?: SyncMetaConfig
}

export interface DaemonDeploymentConfig extends DeploymentConfig {
  strategy: 'daemon'
  daemonDir: string
  dataRoot: string
  socketPath?: string // defaults to {daemonDir}/control.sock
  engine?: EngineConfig
  credentials?: CredentialStoreConfig
}

export interface DockerDeploymentConfig extends DeploymentConfig{
  strategy: 'docker'
  image: string
  resources?: { memory?: string; cpu?: string }
  engine?: EngineConfig
  credentials?: CredentialStoreConfig
}

export interface RemoteDeploymentConfig extends DeploymentConfig {
  strategy: 'remote'
  url: string
  auth?: AuthConfig // { type: "bearer", token } | { type: "mtls", cert }
}

// ============================================================================
// Sub-configs
// ============================================================================

// @not-supported (yet)
export interface BearerTokenAuthConfig {
  type: 'bearer'
  token: string
}
// @not-supported (yet)
export interface MtlsAuthConfig {
  type: 'mtls'
  cert: string
}
export interface NoAuth {}

// Currently, there's no supported auth - but the types bookmark the intention
export type AuthConfig = NoAuth
