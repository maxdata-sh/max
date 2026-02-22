import type {Deployer, Locator} from '@max/core'
import type {InstallationClient} from '../protocols/index.js'
import type {InstallationSpec} from '../config/installation-spec.js'
import {DeploymentConfig} from "./deployment-config.js";

/**
 * Provides Installation nodes.
 */
export interface InstallationDeployer<TDeploymentConfig extends DeploymentConfig = DeploymentConfig> extends Deployer<
  InstallationClient,
  TDeploymentConfig,
  Locator,
  InstallationSpec
> {}
