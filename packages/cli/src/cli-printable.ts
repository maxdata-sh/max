export interface CliPrintable {
  toCliString(): string;
}

export namespace CliPrintable {
  export function printAll(items: CliPrintable[], separator = "\n\n"): string {
    if (items.length === 0) return "";
    return items.map((i) => i.toCliString()).join(separator) + "\n";
  }
}
