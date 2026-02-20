import {Fmt, StaticTypeCompanion} from "@max/core";

export {Fmt};

export class CliPrinter {
  readonly fmt: Fmt;

  constructor(args:{color: boolean}) {
    this.fmt = Fmt.from(args.color);
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
