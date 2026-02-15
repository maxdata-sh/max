import { suggestAsync } from "@optique/core/parser";
import { runParserAsync, RunParserError } from "@optique/core/facade";
import { message } from "@optique/core/message";
import * as Completion from "@optique/core/completion";
import { execute } from "@max/daemon";
import { MaxError } from "@max/core";
import { parserFromCommand } from "./parser-bridge.js";
import { daemonCommand } from "../src/commands/meta-commands.js";
import { DaemonManager, CliPrinter } from "../../app/src/daemon-manager.js";
/** Sentinel thrown by runParserAsync callbacks to signal help/error was shown. */
const HELP_SHOWN = Symbol("help");
const ERROR_SHOWN = Symbol("error");
/** Run an Optique parser and capture help/error output as a Response. */
async function runToResponse(parser, programName, args) {
    let stdout = "";
    let stderr = "";
    try {
        const value = await runParserAsync(parser, programName, args, {
            help: { mode: "option", onShow: () => { throw HELP_SHOWN; } },
            onError: () => { throw ERROR_SHOWN; },
            stdout: (text) => { stdout += text + "\n"; },
            stderr: (text) => { stderr += text + "\n"; },
        });
        return { ok: true, value: value };
    }
    catch (e) {
        if (e === HELP_SHOWN) {
            return { ok: false, response: { stdout, exitCode: 0 } };
        }
        if (e === ERROR_SHOWN || e instanceof RunParserError) {
            return { ok: false, response: { stderr, exitCode: 1 } };
        }
        throw e;
    }
}
export class CommandRunner {
    commands;
    ctx;
    cliName;
    parsers;
    daemon;
    constructor(commands, ctx, cliName, config, printer) {
        this.commands = commands;
        this.ctx = ctx;
        this.cliName = cliName;
        this.parsers = new Map();
        for (const [name, cmd] of commands) {
            this.parsers.set(name, parserFromCommand(cmd, ctx));
        }
        this.daemon = new DaemonManager(config, printer);
    }
    static create(commands, ctx, cliName = "max", config, printer = new CliPrinter(true)) {
        return new CommandRunner(commands, ctx, cliName, config, printer);
    }
    static shells = {
        zsh: Completion.zsh,
        bash: Completion.bash,
        fish: Completion.fish,
    };
    async execute(argv) {
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
        // daemon management — run through Optique harness, dispatch to DaemonManager
        if (argv[0] === "daemon") {
            const result = await runToResponse(daemonCommand, this.cliName, argv);
            if (!result.ok)
                return result.response;
            switch (result.value) {
                case "status": return this.daemon.status();
                case "start": return this.daemon.start();
                case "stop": return this.daemon.stop();
                case "enable": return this.daemon.enable();
                case "disable": return this.daemon.disable();
                case "list": return this.daemon.list();
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
        const result = await runToResponse(parser, `${this.cliName} ${cmdName}`, restArgs);
        if (!result.ok)
            return result.response;
        try {
            const output = await execute(cmd, result.value, this.ctx);
            return { stdout: String(output), exitCode: 0 };
        }
        catch (err) {
            const msg = MaxError.isMaxError(err)
                ? err.prettyPrint({ color: true })
                : err instanceof Error
                    ? err.message
                    : String(err);
            return { stderr: `${msg}\n`, exitCode: 1 };
        }
    }
    allCommandSuggestions() {
        const suggestions = Array.from(this.commands.entries()).map(([name, cmd]) => ({
            kind: "literal",
            text: name,
            description: cmd.desc ? message `${cmd.desc}` : undefined,
        }));
        // Meta commands
        suggestions.push({ kind: "literal", text: "daemon", description: message `Manage the background daemon process` }, { kind: "literal", text: "completions", description: message `Output shell completion script` });
        return suggestions;
    }
    async suggest(argv) {
        if (argv.length === 0) {
            return this.allCommandSuggestions();
        }
        const cmdName = argv[0];
        // Daemon completions — delegate to Optique
        if (cmdName === "daemon") {
            const args = argv.length > 1
                ? argv
                : [argv[0], ""];
            try {
                return await suggestAsync(daemonCommand, args);
            }
            catch {
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
        const suggestArgs = subArgs.length > 0
            ? subArgs
            : [""];
        try {
            return await suggestAsync(parser, suggestArgs);
        }
        catch {
            return [];
        }
    }
    generateHelp() {
        let help = `${this.cliName} - Max CLI\n\n`;
        help += "Commands:\n";
        for (const [name, spec] of this.commands) {
            help += `  ${name.padEnd(14)} ${spec.desc || ""}\n`;
        }
        help += '\n\n';
        help += 'Meta commands:\n';
        help += `  ${"daemon".padEnd(14)} Manage the background daemon process\n`;
        help += `  ${"completions".padEnd(14)} Output shell completion script\n`;
        help += `\nUse '${this.cliName} <command> --help' for more info.\n`;
        return help;
    }
}
