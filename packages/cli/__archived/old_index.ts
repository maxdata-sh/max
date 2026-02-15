import * as path from "node:path";
import { Context } from "@max/core";
import { ConnectorRegistry } from "@max/connector";
import { commands, DaemonConfig, DaemonContext, FsProjectManager, UninitializedProjectManager, findProjectRoot } from "@max/daemon";
import * as Completion from "@optique/core/completion";
import type { ShellCompletion } from "@optique/core/completion";
import { createSocketServer } from "./socket.js";
import { CommandRunner } from "./command-runner.js";

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
};

// Resolve project root: --project-root flag (from Rust shim) or walk from CWD
function getProjectRoot(): string | null {
  const idx = process.argv.indexOf("--project-root");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return findProjectRoot(process.cwd());
}

const projectRoot = getProjectRoot();
const config = projectRoot ? new DaemonConfig({ projectRoot }) : null;

const registry = ConnectorRegistry.create();
registry.addLocalNamed("acme", () => import("@max/connector-acme"));
registry.addLocalNamed("linear", () => import("@max/connector-linear"));

const ctx = Context.build(DaemonContext, {
  connectors: registry,
  project: projectRoot
    ? new FsProjectManager(projectRoot)
    : new UninitializedProjectManager(process.cwd()),
});

const runner = CommandRunner.create(commands, ctx, "max", config!);

if (process.argv.includes("--daemonized")) {
  if (!config) {
    console.error("Cannot daemonize without a project root");
    process.exit(1);
  }

  const { existsSync, writeFileSync, mkdirSync } = await import("fs");

  // Ensure daemon directory exists
  mkdirSync(config.daemon.daemonDir, { recursive: true });

  // Check disabled flag
  if (existsSync(config.daemon.disabledPath)) {
    process.exit(0); // disabled — exit silently
  }

  // Write PID file
  writeFileSync(config.daemon.pidPath, String(process.pid));

  // Write project.json for discoverability
  writeFileSync(
    path.join(config.daemon.daemonDir, "project.json"),
    JSON.stringify({ root: config.projectRoot }),
  );

  // Daemon mode: socket server
  createSocketServer({
    socketPath: config.daemon.socketPath,
    runner,
  });
  console.log(`Max daemon listening on ${config.daemon.socketPath}`);
} else {
  // Strip --project-root from argv before passing to commands
  let argv = process.argv.slice(2);
  const prIdx = argv.indexOf("--project-root");
  if (prIdx !== -1) {
    argv = [...argv.slice(0, prIdx), ...argv.slice(prIdx + 2)];
  }

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
  const response = await runner.execute(argv);
  if (response.stdout) process.stdout.write(response.stdout);
  if (response.stderr) process.stderr.write(response.stderr);
  process.exit(response.exitCode);
}
