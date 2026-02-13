/**
 * max connect <source> — Connect a data source via interactive onboarding.
 */

import { Command } from "../command.js";
import { Param } from "../param.js";
import { DaemonContext } from "../context.js";
import { ErrConnectorNotFound, ErrNoOnboarding } from "../errors.js";
import { runOnboardingCli } from "../onboarding-runner.js";

export const connectCommand = Command.define({
  name: "connect",
  desc: "Connect a data source",
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
  },
  async run({ source }, ctx) {
    const mod = await ctx.connectors.resolve(source);

    if (!mod.def.onboarding) {
      throw ErrNoOnboarding.create({ connector: source });
    }

    const pending = ctx.project.prepare(source);
    const credentialStore = ctx.project.credentialStoreFor(pending);

    const config = await runOnboardingCli(mod.def.onboarding, {
      credentialStore,
    });

    await ctx.project.commit(pending, config);

    return `\nConnected ${mod.def.displayName} successfully.\n`;
  },
});
