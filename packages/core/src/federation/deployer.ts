import {Id} from "../brand.js";
import type {Supervised} from "./supervised.js";
import { DeployableSpec, DeploymentConfig, PlatformName } from '@max/federation'
import type { Locator, UnlabelledHandle } from './node-handle.js'


/**
 * DeployerKind — Branded string identifying a deployment strategy.
 *
 * Carries a phantom type parameter TConfig representing the deployer's
 * config shape. When constructed via DeployerKind.create<TConfig>(), the
 * string carries type info at compile time. When assigned from a plain
 * string (e.g., from persisted config), TConfig defaults to unknown.
 *
 * This unifies typed and dynamic deployer selection into one code path.
 */
export type DeployerKind<TConfig = unknown> = Id<'deployer-kind'> & {
  readonly __config?: TConfig
}

export const DeployerKind = {
  /** Create a typed deployer kind constant. The string value is used at runtime; TConfig is compile-time only. */
  create<TConfig>(name: string): DeployerKind<TConfig> {
    return name as DeployerKind<TConfig>
  },
}

/** Extract the config type carried by a DeployerKind. */
export type ConfigOf<K extends DeployerKind> =
  K extends DeployerKind<infer C> ? C & DeploymentConfig : DeploymentConfig


/**
 * Deployer — Stateless factory for one deployment strategy.
 *
 * Each deployer knows how to create or connect to nodes of one hosting type.
 * It returns an UnlabelledHandle — a live node without identity. The parent
 * (via its Supervisor) assigns the ID after the fact.
 *
 * Deployers are pluggable — the parent registers deployers by target type.
 * Adding a new deployment strategy (e.g., DockerNodeProvider) doesn't require
 * modifying the parent or its Supervisor.
 *
 * The provider has no memory of what it's created. It doesn't list anything.
 * It doesn't assign IDs. It's a stateless factory.
 *
 * Examples:
 *   - DaemonDeployer: spawns local Bun processes, Unix sockets
 *   - RemoteDeployer: connects to a URL, HTTP transport
 *   - DockerDeployer: spawns containers, Docker API, mapped ports
 *   - InProcessDeployer: instantiates in same process, no overhead
 *
 * @typeParam R - The supervised interface children expose
 * @typeParam TConfig - Provider-specific configuration for spawning
 */
export interface Deployer<
  R extends Supervised = Supervised,
  TConfig extends DeploymentConfig = DeploymentConfig,
  TLocator extends Locator = Locator,
  TSpec extends DeployableSpec = DeployableSpec,
> {
  readonly deployerKind: DeployerKind<TConfig>

  // TODO: I reckon we can simplify now that TConfig and TSpec are bound together

  /** Spawn or provision a new node. Returns an unlabelled handle (no ID). */
  create(config: TConfig, nodeSpec: TSpec): Promise<UnlabelledHandle<R, TLocator>>

  /** Bind to an existing node at a known location. Returns an unlabelled handle (no ID). */
  connect(config: TConfig, nodeSpec: TSpec): Promise<UnlabelledHandle<R, TLocator>>

  /** Tear down any infrastructure related to this deployment */
  teardown(config: TConfig, nodeSpec: TSpec): Promise<void>
}

