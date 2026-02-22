import { Fmt } from './fmt.js'

type PrintFn<T> = (value: T, fmt: Fmt) => string

export class Printer<T> {
  constructor(private fn: PrintFn<T>) {}

  static define<T>(fn: (value: T, fmt: Fmt) => string) {
    return new Printer(fn)
  }

  print(value: T, fmt: Fmt): string {
    return this.fn(value, fmt)
  }

  /** Convenience function for multi-line output */
  static lines(strings: string[]): string {
    return strings.join('\n')
  }
}

export class PrintFormatter {
  constructor(private fmt: Fmt) {}
  printVia<T>(printer: Printer<T>, value: T): string {
    return printer.print(value, this.fmt)
  }
  printListVia<T>(printer: Printer<T>, values: T[], separator: string = '\n\n'): string {
    return values.map((t) => printer.print(t, this.fmt)).join(separator)
  }
}
