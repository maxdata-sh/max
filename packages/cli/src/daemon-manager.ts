import { existsSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import type { Response } from "@max/daemon";
import type { DaemonConfig } from "./config.js";

export class DaemonManager {
  constructor(private config: DaemonConfig) {}

  status(): Response {
    const { socketPath, pidPath, disabledPath } = this.config.daemon;
    const enabled = !existsSync(disabledPath);
    const pid = this.readPid();
    const alive = pid !== null && this.isProcessAlive(pid);
    const socketExists = existsSync(socketPath);

    let out = "";
    if (alive) {
      out += `Daemon:  running (pid ${pid})\n`;
      out += `Socket:  ${socketPath}\n`;
    } else {
      out += "Daemon:  not running\n";
      if (socketExists) out += `Warning: stale socket at ${socketPath}\n`;
    }
    out += `Enabled: ${enabled ? "yes" : "no"}\n`;
    return { stdout: out, exitCode: 0 };
  }

  start(): Response {
    if (existsSync(this.config.daemon.disabledPath)) {
      return { stderr: "Daemon is disabled. Run 'max daemon enable' first.\n", exitCode: 1 };
    }
    const proc = Bun.spawn(["bun", "run", import.meta.filename, "--daemonized"], {
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

  private readPid(): number | null {
    try {
      const raw = readFileSync(this.config.daemon.pidPath, "utf-8").trim();
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
