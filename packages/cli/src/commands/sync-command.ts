import { ProjectCompleters } from "../parsers/project-completers.js";
import { argument, command, constant } from '@optique/core/primitives'
import { object } from "@optique/core/constructs";

import { message } from "@optique/core/message";
import { Lazily } from '@max/core'

export const syncCommandBuild = (args: Lazily<{
  completers: ProjectCompleters
}>) => command(
  'sync',
  object({
    cmd: constant('sync'),
    connector: argument(args.completers.installedConnectorSource, {
      description: message`Connector to sync`,
    }),
    name: argument(args.completers.installationName, {
      description: message`Installation name`,
    }),
  }),
  { description: message`Sync data from a connected source` }
)
