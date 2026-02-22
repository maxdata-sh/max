import type { Deployer, Locator } from '@max/core'
import type { WorkspaceClient } from '../protocols/index.js'
import {DeploymentConfig} from "./deployment-config.js";
import {WorkspaceSpec} from "../config/workspace-spec.js";

/** Provides Workspace nodes.
 *  Real implementations include in-process, subprocess, docker etc.
 * */
export interface WorkspaceDeployer<TConfig extends DeploymentConfig = DeploymentConfig> extends Deployer<
  WorkspaceClient,
  TConfig,
  Locator,
  WorkspaceSpec
> {}
