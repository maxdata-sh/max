import * as path from "node:path";
import * as os from "node:os";
import { existsSync, unlinkSync, writeFileSync, readFileSync, readdirSync } from "fs";
import type { Response } from "@max/daemon";
import type { DaemonConfig } from "@max/daemon";
import type { CliPrintable, Fmt } from "./cli-printable.js";
import { CliPrinter } from "./cli-printable.js";

export class DaemonStatus implements CliPrintable {
  constructor(
    readonly alive: boolean,
    readonly pid: number | null,
    readonly socketPath: string,
    readonly enabled: boolean,
    readonly staleSocket: boolean,
  ) {}

  toCliString(fmt: Fmt): string {
    const lines: string[] = [];
    if (this.alive) {
      lines.push(`${fmt.dim("Daemon:")}  ${fmt.green("●")} running ${fmt.dim(`(pid ${this.pid})`)}`);
      lines.push(`${fmt.dim("Socket:")}  ${this.socketPath}`);
    } else {
      lines.push(`${fmt.dim("Daemon:")}  ○ not running`);
      if (this.staleSocket) lines.push(`${fmt.yellow("Warning:")} stale socket at ${this.socketPath}`);
    }
    lines.push(`${fmt.dim("Enabled:")} ${this.enabled ? "yes" : "no"}`);
    return lines.join("\n");
  }
}

export class DaemonEntry implements CliPrintable {
  constructor(
    readonly root: string,
    readonly hash: string,
    readonly status: "running" | "stopped" | "stale",
    readonly pid: number | null,
  ) {}

  toCliString(fmt: Fmt): string {
    const indicator =
      this.status === "running"
        ? fmt.green("●")
        : this.status === "stale"
          ? fmt.red("●")
          : "○";

    const label = this.status === "running"
      ? `${fmt.green('running')} ${fmt.dim(`(pid ${this.pid})`)}`
      : this.status;

    return [
      this.root,
      `  ${fmt.normal("Hash:")}   ${this.hash}`,
      `  ${fmt.normal("Status:")} ${indicator} ${label}`,
    ].join("\n");
  }
}

export { CliPrinter } from "./cli-printable.js";

export class DaemonManager {
  constructor(private config: DaemonConfig, private printer: CliPrinter) {}

  status(): Response {
    const { socketPath, disabledPath } = this.config.daemon;
    const pid = this.readPid();
    const alive = pid !== null && this.isProcessAlive(pid);

    const status = new DaemonStatus(
      alive,
      pid,
      socketPath,
      !existsSync(disabledPath),
      !alive && existsSync(socketPath),
    );
    return { stdout: this.printer.print(status) + "\n", exitCode: 0 };
  }

  start(): Response {
    if (existsSync(this.config.daemon.disabledPath)) {
      return { stderr: "Daemon is disabled. Run 'max daemon enable' first.\n", exitCode: 1 };
    }
    const proc = Bun.spawn([
      "bun", "run", import.meta.filename,
      "--daemonized", "--project-root", this.config.projectRoot,
    ], {
      stdin: "ignore", stdout: "ignore", stderr: "inherit",
    });
    proc.unref();
    return { stdout: "Daemon starting...\n", exitCode: 0 };
  }

  stop(): Response {
    if (this.killDaemon()) {
      return { stdout: "Daemon stopped. Use 'disable' to prevent restart.\n", exitCode: 0 };
    }
    return { stdout: "Daemon is not running\n", exitCode: 0 };
  }

  enable(): Response {
    try { unlinkSync(this.config.daemon.disabledPath); } catch { /* already enabled */ }
    return { stdout: "Daemon enabled\n", exitCode: 0 };
  }

  disable(): Response {
    writeFileSync(this.config.daemon.disabledPath, "");
    this.killDaemon();
    return { stdout: "Daemon disabled\n", exitCode: 0 };
  }

  list(): Response {
    const entries = this.discoverDaemons();
    if (entries.length === 0) {
      return { stdout: "No daemons found.\n", exitCode: 0 };
    }
    return { stdout: this.printer.printAll(entries), exitCode: 0 };
  }

  private discoverDaemons(): DaemonEntry[] {
    const daemonsDir = path.join(os.homedir(), ".max", "daemons");
    if (!existsSync(daemonsDir)) return [];

    const entries: DaemonEntry[] = [];
    for (const entry of readdirSync(daemonsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(daemonsDir, entry.name);
      const projectJsonPath = path.join(dir, "project.json");
      if (!existsSync(projectJsonPath)) continue;

      const data = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
      const pid = this.readPidFrom(path.join(dir, "daemon.pid"));
      const alive = pid !== null && this.isProcessAlive(pid);

      const status = alive ? "running" : pid !== null ? "stale" : "stopped";
      entries.push(new DaemonEntry(data.root, entry.name, status, pid));
    }
    return entries;
  }

  private readPid(): number | null {
    return this.readPidFrom(this.config.daemon.pidPath);
  }

  private readPidFrom(pidPath: string): number | null {
    try {
      const raw = readFileSync(pidPath, "utf-8").trim();
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
    const { socketPath, pidPath } = this.config.daemon;
    const pid = this.readPid();
    if (pid !== null && this.isProcessAlive(pid)) {
      try { process.kill(pid, "SIGTERM"); } catch { /* ignore */ }
      try { unlinkSync(pidPath); } catch { /* ignore */ }
      try { unlinkSync(socketPath); } catch { /* ignore */ }
      return true;
    }
    if (existsSync(socketPath)) {
      try { unlinkSync(socketPath); } catch { /* ignore */ }
    }
    return false;
  }
}
