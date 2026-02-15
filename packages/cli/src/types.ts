export type CliResponse = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  completions?: string[];
  completionOutput?: string;
};

export type CliRequest = {
  kind: "run" | "complete";
  argv: string[];
  shell?: string;
  cwd?: string;
};
