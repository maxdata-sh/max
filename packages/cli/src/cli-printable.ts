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

export interface CliPrintable {
  toCliString(fmt: Fmt): string;
}

export class CliPrinter {
  readonly fmt: Fmt;

  constructor(color: boolean) {
    this.fmt = new Fmt(color);
  }

  print(item: CliPrintable): string {
    return item.toCliString(this.fmt);
  }

  printAll(items: CliPrintable[], separator = "\n\n"): string {
    if (items.length === 0) return "";
    return items.map((i) => i.toCliString(this.fmt)).join(separator) + "\n";
  }
}
