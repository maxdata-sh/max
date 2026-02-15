import { ProjectCompleters } from "../parsers/project-completers.js";
import { argument, command, constant } from '@optique/core/primitives'
import { object } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import { Lazily } from '@max/core'

export const connectCommandBuild = (args: Lazily<{
  completers: ProjectCompleters
}>) => command(
  'connect',
  object({
    cmd: constant('connect'),
    source: argument(args.completers.connectorSource, {
      description: message`Connector to set up`,
    }),
  }),
  { description: message`Connect a new data source` }
)
