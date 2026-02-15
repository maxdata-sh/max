import {StaticTypeCompanion} from "@max/core";

export class Fmt {
  constructor(readonly color: boolean) {}

  dim(text: string): string { return this.wrap("\x1b[2m", text); }
  bold(text: string): string { return this.wrap("\x1b[1m", text); }
  underline(text: string): string { return this.wrap("\x1b[4m", text); }
  green(text: string): string { return this.wrap("\x1b[32m", text); }
  red(text: string): string { return this.wrap("\x1b[31m", text); }
  yellow(text: string): string { return this.wrap("\x1b[33m", text); }
  normal(text: string): string { return this.wrap("\x1b[37m", text); }

  private wrap(code: string, text: string): string {
    return this.color ? `${code}${text}\x1b[0m` : text;
  }
}

export class CliPrinter {
  readonly fmt: Fmt;

  constructor(args:{color: boolean}) {
    this.fmt = new Fmt(args.color);
  }

  print<T>(printer: CliValuePrinter<T>, item: T): string {
    return printer.print(item, this.fmt)
  }

  printAll<T>(printer: CliValuePrinter<T>, items:T[], separator: string = '\n\n'): string {
    return items.map(t => printer.print(t, this.fmt)).join(separator)
  }

}

export interface CliValuePrinter<in T> {
  print(value:T, fmt: Fmt): string
}

export const CliValuePrinter = StaticTypeCompanion({
  of<T>(fn: CliValuePrinter<T>['print']): CliValuePrinter<T> {
    return { print: fn }
  }
})
