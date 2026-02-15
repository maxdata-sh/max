import {ErrNoOnboarding} from "@max/daemon";
import {ProjectContext} from "../context/contexts.js";
import {ManagedInstallation} from "../project-manager/index.js";

export const connect = ({
  // name: "connect",
  // desc: "Connect a data source",
  // context: DaemonContext,
  // params: {
  //   source: Param.string({
  //     required: true,
  //     desc: "Connector name",
  //     oneOf: Param.oneOf({
  // FIXME: CLAUDE: We need to auto-complete in the cli layer
  //       values: (ctx: DaemonContext) => ctx.connectors.list().map((e) => e.name),
  //       orThrow: (value) => ErrConnectorNotFound.create({ connector: String(value) }),
  //     }),
  //   }),
  // },
  async run(args:{ connectorName: string }, ctx: ProjectContext ): Promise<ManagedInstallation> {
    const source = args.connectorName
    const mod = await ctx.connectorRegistry.resolve(source);

    if (!mod.def.onboarding) {
      throw ErrNoOnboarding.create({ connector: source });
    }

    const pending = ctx.projectManager.prepare(source);
    const credentialStore = ctx.projectManager.credentialStoreFor(pending);


    // FIXME: CLAUDE: We can't do this yet. We need to chat about how
    // const config = await runOnboardingCli(mod.def.onboarding, {
    //   credentialStore,
    // });
    const config = null as any

    const installation = await ctx.projectManager.commit(pending, config);

    return installation

    // FIXME: CLAUDE: We push this into cli display
    // return `\nConnected ${mod.def.displayName} successfully.\n`;
  },
});
