import {ProjectConfig} from "../config/project-config.js";
import type {ConnectorRegistry} from "@max/connector";
import {ErrProjectNotInitialised, ProjectManager} from "../project-manager/index.js";
import {GlobalConfig} from "../config/global-config.js";


// TODO: Rename to GlobalApplicationContext
export class GlobalContext {
  public config: GlobalConfig

  // TODO: Let's explore whether a Context.build() type abstraction is useful here.
  constructor(args:{
    config: GlobalConfig

  }) {
    this.config = args.config
  }

}

// TODO: Rename to ProjectApplicationContext
export interface ProjectContext {
  projectConfig: ProjectConfig
  global: GlobalContext
  projectManager: ProjectManager
  connectorRegistry: ConnectorRegistry
}
export class ProjectContextImpl implements ProjectContext {
  constructor(
    public projectConfig: ProjectConfig,
    public global: GlobalContext,
    public projectManager: ProjectManager,
    public connectorRegistry: ConnectorRegistry
  ) {
  }

}

export const EmptyProjectContext = {
  create(projectRoot: string){
    return new Proxy({} as ProjectContext, {
      get: (_target, prop) => {
        throw ErrProjectNotInitialised.create({maxProjectRoot: projectRoot})
      },
    })
  }
}
