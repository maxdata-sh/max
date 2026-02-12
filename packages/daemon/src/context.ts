import { Context } from "@max/core";
import type { ConnectorRegistry } from "@max/connector";
import type { ProjectManager } from "./project-manager/index.js";

export class DaemonContext extends Context {
  connectors = Context.instance<ConnectorRegistry>();
  project = Context.instance<ProjectManager>();
}
