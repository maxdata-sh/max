import {choice, command, option, suggest} from '@optique/core'
import {object} from "@optique/core/constructs";
import {argument} from "@optique/core/primitives";
import {optional} from "@optique/core/modifiers";


const y = command("foo", object({
  source: argument(choice(["debug", "info", "warn", "error"])),   // required string → positional
  json: optional(option("--json")),     // boolean → flag
},{allowDuplicates:false}))

console.dir({result: suggest(y, ['foo','debug'])},{depth:null})
// This gives me debug, info, warn and error as suggestions. No --json(!)

// const result = run(nameParser, {
//
//
//   args: ["--name", "Alice"]
// });

