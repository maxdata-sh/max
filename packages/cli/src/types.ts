export type CliResponse = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  completions?: string[];
  completionOutput?: string;
};

export type CliRequest = {
  kind: "run" | "complete";
  argv: readonly string[];
  shell?: string;
  cwd?: string;
  color?: boolean;
};
