import { Context } from "@max/core";
import type { ConnectorRegistry } from "@max/connector";

export class DaemonContext extends Context {
  connectors = Context.instance<ConnectorRegistry>();
}
