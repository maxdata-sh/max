import {command, constant} from "@optique/core/primitives";
import {or} from "@optique/core/constructs";
import {message} from "@optique/core/message";

export const daemonCommand = command("daemon", or(
  command("status", constant("status" as const), {
    description: message`Show daemon status`,
  }),
  command("start", constant("start" as const), {
    description: message`Start the background daemon`,
  }),
  command("stop", constant("stop" as const), {
    description: message`Stop the background daemon`,
  }),
  command("enable", constant("enable" as const), {
    description: message`Enable daemon auto-start`,
  }),
  command("disable", constant("disable" as const), {
    description: message`Disable daemon and stop if running`,
  }),
  command("list", constant("list" as const), {
    description: message`List all known project daemons`,
  }),
), {
  description: message`Manage the background daemon process`,
});


