import { parseAsync, suggestAsync } from "@optique/core/parser";
import type { Parser, Mode, Suggestion } from "@optique/core/parser";
import { formatMessage, message } from "@optique/core/message";
import * as Completion from "@optique/core/completion";
import type { ShellCompletion } from "@optique/core/completion";
import type { CommandDefAny } from "@max/daemon";
import { execute } from "@max/daemon";
import { MaxError } from "@max/core";
import type { InferContext, Context } from "@max/core";
import type { Response } from "@max/daemon";
import { parserFromCommand } from "./parser-bridge.js";
import { daemonCommand } from "./meta-commands.js";
import { DaemonManager } from "./daemon-manager.js";

export class CommandRunner {
  private parsers: Map<string, Parser<Mode, Record<string, unknown>, unknown>>;
  private daemon = new DaemonManager();

  private constructor(
    private commands: ReadonlyMap<string, CommandDefAny>,
    private ctx: InferContext<Context>,
    private cliName: string,
  ) {
    this.parsers = new Map();
    for (const [name, cmd] of commands) {
      this.parsers.set(name, parserFromCommand(cmd, ctx));
    }
  }

  static create(
    commands: ReadonlyMap<string, CommandDefAny>,
    ctx: InferContext<Context>,
    cliName: string = "max",
  ): CommandRunner {
    return new CommandRunner(commands, ctx, cliName);
  }

  private static shells: Record<string, ShellCompletion> = {
    zsh: Completion.zsh,
    bash: Completion.bash,
    fish: Completion.fish,
  };

  async execute(argv: string[]): Promise<Response> {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
      return { stdout: this.generateHelp(), exitCode: 0 };
    }

    // completions <shell> — output shell init script
    if (argv[0] === "completions") {
      const shell = CommandRunner.shells[argv[1]];
      if (shell) {
        return { stdout: shell.generateScript(this.cliName, ["__complete", argv[1]]), exitCode: 0 };
      }
      return { stderr: `Unsupported shell: ${argv[1] ?? "(none)"}\nSupported: zsh, bash, fish\n`, exitCode: 1 };
    }

    // daemon management — parse through Optique, dispatch to DaemonManager
    if (argv[0] === "daemon") {
      const daemonArgs = argv.slice(1);
      if (daemonArgs.length === 0 || daemonArgs[0] === "--help" || daemonArgs[0] === "-h") {
        return this.daemon.status();
      }
      const result = await parseAsync(daemonCommand, argv);
      if (!result.success) {
        return { stderr: formatMessage(result.error) + "\n", exitCode: 1 };
      }
      switch (result.value) {
        case "status": return this.daemon.status();
        case "start": return this.daemon.start();
        case "stop": return this.daemon.stop();
        case "enable": return this.daemon.enable();
        case "disable": return this.daemon.disable();
      }
    }

    const cmdName = argv[0];
    const cmd = this.commands.get(cmdName);
    const parser = this.parsers.get(cmdName);

    if (!cmd || !parser) {
      return {
        stderr: `Unknown command: ${cmdName}\n\n${this.generateHelp()}`,
        exitCode: 1,
      };
    }

    const restArgs = argv.slice(1);

    if (restArgs.includes("--help") || restArgs.includes("-h")) {
      return { stdout: this.generateCommandHelp(cmd), exitCode: 0 };
    }

    try {
      const result = await parseAsync(parser, restArgs);
      if (!result.success) {
        return {
          stderr: formatMessage(result.error) + "\n",
          exitCode: 1,
        };
      }

      const output = await execute(cmd, result.value, this.ctx);
      return { stdout: String(output), exitCode: 0 };
    } catch (err) {
      const msg = MaxError.isMaxError(err)
        ? err.prettyPrint({ color: true })
        : err instanceof Error
          ? err.message
          : String(err);
      return { stderr: `${msg}\n`, exitCode: 1 };
    }
  }

  private allCommandSuggestions(): Suggestion[] {
    const suggestions: Suggestion[] = Array.from(this.commands.entries()).map(([name, cmd]) => ({
      kind: "literal" as const,
      text: name,
      description: cmd.desc ? message`${cmd.desc}` : undefined,
    }));
    // Meta commands
    suggestions.push(
      { kind: "literal" as const, text: "daemon", description: message`Manage the background daemon process` },
      { kind: "literal" as const, text: "completions", description: message`Output shell completion script` },
    );
    return suggestions;
  }

  async suggest(argv: string[]): Promise<readonly Suggestion[]> {
    if (argv.length === 0) {
      return this.allCommandSuggestions();
    }

    const cmdName = argv[0];

    // Daemon completions — delegate to Optique
    if (cmdName === "daemon") {
      const args: [string, ...string[]] = argv.length > 1
        ? (argv as [string, ...string[]])
        : [argv[0], ""];
      try {
        return await suggestAsync(daemonCommand, args);
      } catch {
        return [];
      }
    }

    const parser = this.parsers.get(cmdName);

    // Command not found → filter all commands by partial
    if (!parser) {
      return this.allCommandSuggestions().filter((s) => s.kind === "literal" && s.text.startsWith(cmdName));
    }

    // Delegate to Optique's suggestAsync for sub-command completions
    // suggestAsync requires a non-empty tuple [string, ...string[]]
    const subArgs = argv.slice(1);
    const suggestArgs: [string, ...string[]] =
      subArgs.length > 0
        ? (subArgs as [string, ...string[]])
        : [""];

    try {
      return await suggestAsync(parser, suggestArgs);
    } catch {
      return [];
    }
  }

  private generateHelp(): string {
    let help = `${this.cliName} - Max CLI\n\n`;
    help += "Commands:\n";
    for (const [name, spec] of this.commands) {
      help += `  ${name.padEnd(14)} ${spec.desc || ""}\n`;
    }
    help += '\n\n'
    help += 'Meta commands:\n'
    help += `  ${"daemon".padEnd(14)} Manage the background daemon process\n`;
    help += `  ${"completions".padEnd(14)} Output shell completion script\n`;
    help += `\nUse '${this.cliName} <command> --help' for more info.\n`;
    return help;
  }

  private generateCommandHelp(cmd: CommandDefAny): string {
    let help = `${cmd.name} - ${cmd.desc || ""}\n\n`;

    const requiredParams = Object.entries(cmd.params).filter(([, p]) => p.required);
    if (requiredParams.length > 0) {
      const positional = requiredParams.map(([name]) => `<${name}>`).join(" ");
      help += `Usage: ${this.cliName} ${cmd.name} ${positional}\n\n`;
    }

    const optionalParams = Object.entries(cmd.params).filter(([, p]) => !p.required);
    if (optionalParams.length > 0) {
      help += "Options:\n";
      for (const [name, param] of optionalParams) {
        help += `  --${name.padEnd(12)} ${param.desc || ""}\n`;
      }
    }
    return help;
  }
}
