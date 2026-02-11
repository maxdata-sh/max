import { SchemaPrettyPrinter } from "@max/core";
import { Command } from "../command.js";
import { Param } from "../param.js";
import { DaemonContext } from "../context.js";
import { ErrConnectorNotFound } from "../errors.js";

export const schemaCommand = Command.define({
  name: "schema",
  desc: "Show entity schema for a connector",
  context: DaemonContext,
  params: {
    source: Param.string({
      required: true,
      desc: "Connector name",
      oneOf: Param.oneOf({
        values: (ctx: DaemonContext) => ctx.connectors.list().map((e) => e.name),
        orThrow: (value) => ErrConnectorNotFound.create({ connector: String(value) }),
      }),
    }),
    json: Param.boolean({ desc: "Output as JSON" }),
  },
  async run({ source, json }, ctx) {
    const mod = await ctx.connectors.resolve(source);
    const schema = mod.def.schema;
    if (json) return SchemaPrettyPrinter.json(schema) + "\n";
    return SchemaPrettyPrinter.text(schema) + "\n";
  },
});
