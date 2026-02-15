import { argument, command, constant } from '@optique/core/primitives'
import {object} from "@optique/core/constructs";
import {withDefault} from "@optique/core/modifiers";
import {flag} from "@optique/core";
import {message} from "@optique/core/message";
import {path} from "@optique/run";

export const initCommand = command(
  'init',
  object({
    cmd: constant('init'),
    force: withDefault(
      flag('--force/-f', { description: message`Force creation of project` }),
      false
    ),
    directory: argument(path({ mustExist: true, type: 'directory' }), {
      description: message`Directory to initialize`,
    }),
  }),
  { description: message`Initialize a new Max project` }
)
