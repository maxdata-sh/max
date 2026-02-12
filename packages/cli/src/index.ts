import { Context } from "@max/core";
import { ConnectorRegistry } from "@max/connector";
import { commands, DaemonContext } from "@max/daemon";
import * as Completion from "@optique/core/completion";
import type { ShellCompletion } from "@optique/core/completion";
import { createSocketServer } from "./socket.js";
import { CommandRunner } from "./command-runner.js";
import { DaemonConfig } from "./config.js";

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
};

const config = DaemonConfig.build();

const registry = ConnectorRegistry.create();
registry.addLocalNamed("acme", () => import("@max/connector-acme"));
registry.addLocalNamed("linear", () => import("@max/connector-linear"));

const ctx = Context.build(DaemonContext, {
  connectors: registry,
});

const runner = CommandRunner.create(commands, ctx, "max", config);

if (process.argv.includes("--daemonized")) {
  // Check disabled flag
  const { existsSync, writeFileSync } = await import("fs");
  if (existsSync(config.daemon.disabledPath)) {
    process.exit(0); // disabled — exit silently
  }

  // Write PID file
  writeFileSync(config.daemon.pidPath, String(process.pid));

  // Daemon mode: socket server
  createSocketServer({
    socketPath: config.daemon.socketPath,
    runner,
  });
  console.log(`Max daemon listening on ${config.daemon.socketPath}`);
} else {
  const argv = process.argv.slice(2);

  // __complete <shell> <args...> — shell completion callback
  if (argv[0] === "__complete") {
    const shell = shells[argv[1]];
    const completionArgs = argv.slice(2);
    const suggestions = await runner.suggest(completionArgs);
    if (shell) {
      for (const chunk of shell.encodeSuggestions(suggestions)) {
        process.stdout.write(chunk);
      }
    }
    process.exit(0);
  }

  // Direct mode: parse argv, run command, exit
  // (includes "completions <shell>" handled by CommandRunner)
  const response = await runner.execute(argv);
  if (response.stdout) process.stdout.write(response.stdout);
  if (response.stderr) process.stderr.write(response.stderr);
  process.exit(response.exitCode);
}
