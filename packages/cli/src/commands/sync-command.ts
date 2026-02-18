import { ProjectCompleters } from "../parsers/project-completers.js";
import { argument, command, constant } from '@optique/core/primitives'
import { object, tuple} from "@optique/core/constructs";

import { message } from "@optique/core/message";
import { Lazily } from '@max/core'
import {choice} from "@optique/core/valueparser";

export const syncCommandBuild = (
  args: Lazily<{
    completers: ProjectCompleters
  }>
) =>
  command(
    'sync',
    object({
      cmd: constant('sync'),
      target: tuple([
        argument(args.completers.installedConnectorSource, {
          description: message`Connector to sync`,
        }),
        argument(args.completers.installationName, {
          description: message`Installation name`,
        }),
      ]),
    }),
    { description: message`Sync data from a connected source` }
  )
