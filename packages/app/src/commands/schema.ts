import {ConnectorName} from "@max/connector";
import {ProjectContext} from "../context/contexts.js";

export const schemaCommand = ({
  // name: "schema",
  // desc: "Show entity schema for a connector",
  // context: DaemonContext,
  // params: {
  //   source: Param.string({
  //     required: true,
  //     desc: "Connector name",
  // FIXME: CLAUDE: We need auto-complete in cli layer
  //     oneOf: Param.oneOf({
  //       values: (ctx: DaemonContext) => ctx.connectors.list().map((e) => e.name),
  //       orThrow: (value) => ErrConnectorNotFound.create({ connector: String(value) }),
  //     }),
  //   }),
  //   json: Param.boolean({ desc: "Output as JSON" }),
  // },
  async run(args:{ source: ConnectorName }, ctx: ProjectContext) {
    const {source} = args
    const mod = await ctx.connectorRegistry.resolve(source);
    return mod.def.schema
  },
});
