import {CliResponse} from "./types.js";
import { Mode, Parser } from '@optique/core/parser'
import { runParserAsync, RunParserError } from '@optique/core/facade'
import {message} from "@optique/core/message";

/** Sentinel thrown by runParserAsync callbacks to signal help/error was shown. */
const HELP_SHOWN = Symbol("help");
const ERROR_SHOWN = Symbol("error");

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
    const value = await runParserAsync(parser, programName, args, {
      colors: useColor,
      help: {
        mode: "both",
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
    throw e;
  }
}
