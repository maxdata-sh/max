/**
 * Fmt — text formatting interface.
 *
 * Two built-in implementations: ANSI terminal colours and a no-op passthrough.
 * Obtain the right one via Fmt.from(boolean).
 */
import {StaticTypeCompanion} from "./companion.js";

export interface Fmt {
  readonly isColor: boolean
  dim(text: string): string
  bold(text: string): string
  underline(text: string): string
  red(text: string): string
  green(text: string): string
  yellow(text: string): string
  normal(text: string): string
}

const RESET = "\x1b[0m";

const ansiFmt: Fmt = {
  isColor: true,
  dim(text) { return `\x1b[2m${text}${RESET}` },
  bold(text) { return `\x1b[1m${text}${RESET}` },
  underline(text) { return `\x1b[4m${text}${RESET}` },
  red(text) { return `\x1b[31m${text}${RESET}` },
  green(text) { return `\x1b[32m${text}${RESET}` },
  yellow(text) { return `\x1b[33m${text}${RESET}` },
  normal(text) { return `\x1b[37m${text}${RESET}` },
}

const noopFmt: Fmt = {
  isColor: false,
  dim: (t) => t,
  bold: (t) => t,
  underline: (t) => t,
  red: (t) => t,
  green: (t) => t,
  yellow: (t) => t,
  normal: (t) => t,
}

export const Fmt = StaticTypeCompanion({
  ansi: ansiFmt as Fmt,
  noop: noopFmt as Fmt,
  from(color: boolean): Fmt {
    return color ? ansiFmt : noopFmt
  },
})
