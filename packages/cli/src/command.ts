/**
 * Command — A self-contained CLI command with type-safe args.
 *
 * Each command owns its parser (lazy) and handler. The `Inferred<this>`
 * trick extracts the parsed value type from the concrete class's parser
 * definition, giving end-to-end type safety from parser → handler args.
 *
 * Commands are instantiated per-request with a CliServices<L> that
 * provides the resolved context and shared utilities.
 */

import type { LazyOne, MaxUrlLevel } from '@max/core'
import type { InferValue, Mode, Parser } from '@optique/core/parser'
import type { Prompter } from './prompter.js'

/** Extract the parsed value type from a Command's parser. */
export type Inferred<T extends Command> = InferValue<T['parser']['get']>

/** Per-request options passed to command handlers. */
export interface CommandOptions {
  color: boolean
  prompter?: Prompter
}

export interface Command {
  /** Command name as typed by the user (e.g. 'schema', 'sync'). */
  readonly name: string
  /** The level(s) this command operates at. */
  readonly level: MaxUrlLevel | readonly MaxUrlLevel[]
  /** Lazy parser — built on first access, can reach into instance context. */
  readonly parser: LazyOne<Parser<Mode>>
  /** Execute the command with type-safe parsed args. */
  run(args: Inferred<this>, opts: CommandOptions): Promise<string>
}
