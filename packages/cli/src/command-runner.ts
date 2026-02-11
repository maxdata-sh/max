import { existsSync, unlinkSync, writeFileSync, readFileSync } from "fs";
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

const SOCKET_PATH = "/tmp/max-daemon.sock";
const PID_PATH = "/tmp/max-daemon.pid";
const DISABLED_PATH = "/tmp/max-daemon.disabled";

export class CommandRunner {
  private parsers: Map<string, Parser<Mode, Record<string, unknown>, unknown>>;

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

    // daemon management
    if (argv[0] === "daemon") {
      return this.handleDaemon(argv.slice(1));
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
    for (const [name, desc] of CommandRunner.harnessCommands) {
      suggestions.push({ kind: "literal" as const, text: name, description: message`${desc}` });
    }
    return suggestions;
  }

  async suggest(argv: string[]): Promise<readonly Suggestion[]> {
    if (argv.length === 0) {
      return this.allCommandSuggestions();
    }

    const cmdName = argv[0];
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

  private handleDaemon(args: string[]): Response {
    const sub = args[0];

    if (!sub || sub === "--help" || sub === "-h" || sub === "status") {
      return this.daemonStatus();
    }

    if (sub === "--enable") {
      try { unlinkSync(DISABLED_PATH); } catch { /* already enabled */ }
      return { stdout: "Daemon enabled\n", exitCode: 0 };
    }

    if (sub === "--disable") {
      writeFileSync(DISABLED_PATH, "");
      // Stop daemon if running
      this.killDaemon();
      return { stdout: "Daemon disabled\n", exitCode: 0 };
    }

    if (sub === "start") {
      if (existsSync(DISABLED_PATH)) {
        return { stderr: "Daemon is disabled. Run 'max daemon --enable' first.\n", exitCode: 1 };
      }
      // In direct mode, we spawn a daemon process
      const proc = Bun.spawn(["bun", "run", import.meta.filename, "--daemonized"], {
        stdin: "ignore", stdout: "ignore", stderr: "inherit",
      });
      proc.unref();
      return { stdout: "Daemon starting...\n", exitCode: 0 };
    }

    if (sub === "stop") {
      if (this.killDaemon()) {
        return { stdout: "Daemon stopped. Use --disable to prevent restart.\n", exitCode: 0 };
      }
      return { stdout: "Daemon is not running\n", exitCode: 0 };
    }

    return { stderr: `Unknown daemon command: ${sub}\nUsage: ${this.cliName} daemon [status|start|stop|--enable|--disable]\n`, exitCode: 1 };
  }

  private daemonStatus(): Response {
    const enabled = !existsSync(DISABLED_PATH);
    const pid = this.readPid();
    const alive = pid !== null && this.isProcessAlive(pid);
    const socketExists = existsSync(SOCKET_PATH);

    let out = "";
    if (alive) {
      out += `Daemon:  running (pid ${pid})\n`;
      out += `Socket:  ${SOCKET_PATH}\n`;
    } else {
      out += "Daemon:  not running\n";
      if (socketExists) out += `Warning: stale socket at ${SOCKET_PATH}\n`;
    }
    out += `Enabled: ${enabled ? "yes" : "no"}\n`;
    return { stdout: out, exitCode: 0 };
  }

  private readPid(): number | null {
    try {
      const raw = readFileSync(PID_PATH, "utf-8").trim();
      const pid = parseInt(raw, 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private killDaemon(): boolean {
    const pid = this.readPid();
    if (pid !== null && this.isProcessAlive(pid)) {
      try { process.kill(pid, "SIGTERM"); } catch { /* ignore */ }
      try { unlinkSync(PID_PATH); } catch { /* ignore */ }
      try { unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
      return true;
    }
    // Clean up stale socket
    if (existsSync(SOCKET_PATH)) {
      try { unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
    }
    return false;
  }

  private static harnessCommands: [string, string][] = [
    ["daemon", "Manage the background daemon process"],
    ["completions", "Output shell completion script"],
  ];

  private generateHelp(): string {
    let help = `${this.cliName} - Max CLI\n\n`;
    help += "Commands:\n";
    for (const [name, spec] of this.commands) {
      help += `  ${name.padEnd(14)} ${spec.desc || ""}\n`;
    }
    help += '\n\n'
    help += 'Meta commands:\n'
    for (const [name, desc] of CommandRunner.harnessCommands) {
      help += `  ${name.padEnd(14)} ${desc}\n`;
    }
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
