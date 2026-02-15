import {CliResponse} from "./types.js";
import { Mode, Parser } from '@optique/core/parser'
import { runParserAsync, RunParserError } from '@optique/core/facade'
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
     * */
    const value = await runParserAsync(parser, programName, args, {
      colors: useColor,
      completion:{
        mode: 'command',
        onShow: () => { throw COMPLETIONS_SHOWN }
      },
      help: {
        mode: 'command',
        onShow: () => { throw HELP_SHOWN; },
      },
      onError: () => { throw ERROR_SHOWN; },
      stdout: (text) => { stdout += text + "\n"; },
      stderr: (text) => { stderr += text + "\n"; },
    });
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
