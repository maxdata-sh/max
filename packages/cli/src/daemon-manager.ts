import { existsSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import type { Response } from "@max/daemon";

const SOCKET_PATH = "/tmp/max-daemon.sock";
const PID_PATH = "/tmp/max-daemon.pid";
const DISABLED_PATH = "/tmp/max-daemon.disabled";

export class DaemonManager {
  status(): Response {
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

  start(): Response {
    if (existsSync(DISABLED_PATH)) {
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
    try { unlinkSync(DISABLED_PATH); } catch { /* already enabled */ }
    return { stdout: "Daemon enabled\n", exitCode: 0 };
  }

  disable(): Response {
    writeFileSync(DISABLED_PATH, "");
    this.killDaemon();
    return { stdout: "Daemon disabled\n", exitCode: 0 };
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
    if (existsSync(SOCKET_PATH)) {
      try { unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
    }
    return false;
  }
}
