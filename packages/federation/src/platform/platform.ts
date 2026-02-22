import {InstallationDeployer, WorkspaceDeployer} from '../deployers/index.js'
import {type DeployerKind, type Id, Supervisor} from '@max/core'
import {DeployerRegistry} from "../deployers/deployer-registry.js";
import {GlobalMax} from "../federation/index.js";

/** The type for a config outside of our purview - lives with the provider/platform */
export type UnknownConfig = Record<string,unknown>

/** Platform name — which runtime environment hosts this node. Soft-branded. */
export type PlatformName = Id<'platform-name'>


/**
 * A platform provides us with a minimum of workspace + installation support.
 *
 * All extra properties are platform-specific.
 */
export interface Platform {
  name: PlatformName
  installation: {
    deploy: Record<string, DeployerKind<any>>
    registry: DeployerRegistry<InstallationDeployer>
  }
  workspace: {
    deploy: Record<string, DeployerKind<any>>
    registry: DeployerRegistry<WorkspaceDeployer>
  }
  createGlobalMax(): GlobalMax
  general: {
    createSupervisor(): Supervisor<any>
  }
}

export class Platform {
  static define<const P extends Platform>(platformDefinition: P): P {
    return platformDefinition
  }
}
