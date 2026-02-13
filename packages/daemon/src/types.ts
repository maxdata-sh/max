export type CompletionCtx = {
  argv: string[];
  parsed: Record<string, unknown>;
};

export type FlagSpec = {
  name: string;
  alias?: string;
  desc?: string;
  type?: "string" | "boolean" | "number";
  complete?: (ctx: CompletionCtx) => string[] | Promise<string[]>;
};

export type CommandSpec = {
  name: string;
  desc?: string;
  flags: FlagSpec[];
  positional?: {
    name: string;
    desc?: string;
    complete?: (ctx: CompletionCtx) => string[] | Promise<string[]>;
  };
  run: (parsed: Record<string, unknown>) => string | Promise<string>;
};

export type Request = {
  kind: "run" | "complete";
  argv: string[];
  shell?: string;
  cwd?: string;
};

export type Response = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  completions?: string[];
  completionOutput?: string;
};
