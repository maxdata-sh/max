import { group, or } from '@optique/core/constructs'
import { InferValue, suggestAsync } from '@optique/core/parser'
import { run } from '@optique/run'
import { defineProgram } from '@optique/core/program'
import { daemonCommand } from '../commands/daemon-command.js'
import { initCommand } from '../commands/init-command.js'
import { message } from '@optique/core/message'

const parser = group('top', or(daemonCommand, initCommand))

// TypeScript creates a perfect discriminated union
type GitCommand = InferValue<typeof parser>

// const result1 = run(parser,"completion"["add","one"],{completion:{mode:'command'}});
const result = await suggestAsync(parser, ['add', 'one', '']).then((r) => console.log(r))

const p = defineProgram({
  parser,
  metadata: {
    name: 'max',
    version: '1.1',
  },
})
console.log(
  run(p, {
    args: ['help'],
    aboveError: 'none',
    completion: { mode: 'both', group: 'meta', helpVisibility: 'singular' },
    help: { group: 'meta', mode: 'both' },
    description: message`Test`,
    showChoices: true,
  })
)

// RIGHT: Here's the rub - optique is pretty opinionated about help text, and i don't like its opinions. Short answer:
// port the formatDocPage logic from here https://github.com/dahlia/optique/blob/75957cc504d15fb2d14cc40677cd1ac152e42905/packages/core/src/facade.ts#L13
// into an output format we're happy with

// run(parser, {
//   args: ["completion","zsh", "add", "one","one",""],
//   completion: {mode:'command'},
//
// })
