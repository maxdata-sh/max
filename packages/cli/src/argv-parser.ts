import {CliResponse} from "./types.js";
import {Mode, Parser} from '@optique/core/parser'
import {runParserAsync, RunParserError} from '@optique/core/facade'
import {message} from "@optique/core/message";

/** Sentinel thrown by runParserAsync callbacks to signal help/error was shown. */
const HELP_SHOWN = Symbol("help");
const ERROR_SHOWN = Symbol("error");
const COMPLETIONS_SHOWN = Symbol('completions')

type RunResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: CliResponse };

export async function parseAndValidateArgs<T>(
  parser: Parser<Mode, T, unknown>,
  programName: string,
  args: readonly string[],
  useColor?: boolean
): Promise<RunResult<T>> {
  let stdout = "";
  let stderr = "";

  try {
    /** NOTE: We could parse ourselves, rather than using opqtique's full batteries-included parse method.
     *  It will give us greater control over how help and completions are rendered. Leaving this for another time.
     *  UPDATE / FIXME:
     *    RIGHT: Here's the rub - optique is pretty opinionated about help text, and i don't like its opinions. Short answer:
     *    port the formatDocPage logic from here https://github.com/dahlia/optique/blob/75957cc504d15fb2d14cc40677cd1ac152e42905/packages/core/src/facade.ts#L13
     *    into an output format we're happy with
     *
     * */
    const value = await runParserAsync(parser, programName, args, {
      colors: useColor,
      aboveError: 'help',
      completion: {
        mode: 'both',
        group: 'meta',
        helpVisibility: 'singular',
      },
      help: {
        group: 'meta',
        mode: 'both',
        onShow: () => {

          throw HELP_SHOWN
        },
      },
      showChoices: true,
      onError: () => {
        throw ERROR_SHOWN
      },
      stdout: (text) => {
        stdout += text + '\n'
      },
      stderr: (text) => {
        stderr += text + '\n'
      },
    })
    return { ok: true, value: value as T };
  } catch (e) {
    if (e === HELP_SHOWN) {
      return { ok: false, response: { stdout, exitCode: 0 } };
    }
    if (e === ERROR_SHOWN || e instanceof RunParserError) {
      return { ok: false, response: { stderr, exitCode: 1 } };
    }
    if (e === COMPLETIONS_SHOWN){
      // Slightly naughty/lazy - "ok: false" isn't strictly the case here.
      return { ok: false, response: { stdout, stderr, exitCode: 0 } }
    }
    throw e;
  }
}
