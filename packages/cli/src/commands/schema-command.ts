import {ProjectCompleters} from "../parsers/project-completers.js";
import { argument, command, constant } from '@optique/core/primitives'
import {object} from "@optique/core/constructs";
import {message} from "@optique/core/message";
import {outputOption} from "../parsers/standard-opts.js";
import { Lazily, makeLazy } from '@max/core'

export const schemaCommandBuild = (args: Lazily<{
  completers: ProjectCompleters
}>) => command(
  'schema',
  object({
    cmd: constant('schema'),
    source: argument(args.completers.connectorSource, {
      description: message`Source to show schema for`,
    }),
    output: outputOption,
  }),
  { description: message`Display the entity schema for a source` }
)
