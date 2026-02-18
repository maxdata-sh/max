/**
 * Shared MaxProjectApp bootstrap for examples.
 *
 * Points at bun-test-project/ which has a .max directory with installations.
 * Usage: import { app } from "./app.js"
 */

import * as path from "node:path";
import {
  FsConnectorRegistry,
  FsProjectManager,
  GlobalConfig,
  MaxProjectApp,
  type MaxProjectAppDependencies,
  ProjectConfig,
  FsProjectDaemonManager,
} from "@max/federation";
import { makeLazy } from "@max/core";

const projectRoot = path.resolve(import.meta.dirname, "../../bun-test-project");

const cfg = new GlobalConfig({
  projectRoot,
  cwd: projectRoot,
  mode: "direct",
});

const projectConfig = new ProjectConfig(cfg, { projectRootFolder: projectRoot });

const deps = makeLazy<MaxProjectAppDependencies>({
  projectConfig: () => projectConfig,
  projectManager: () => new FsProjectManager(projectRoot),
  connectorRegistry: () =>
    new FsConnectorRegistry({
      acme: "@max/connector-acme",
    }),
  daemonManager: () => new FsProjectDaemonManager(projectConfig),
});

export const app = new MaxProjectApp(deps);
