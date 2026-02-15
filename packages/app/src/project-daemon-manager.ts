import * as path from "node:path";
import * as os from "node:os";
import {existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync} from "fs";
import {ProjectConfig} from "./config/project-config.js";
import { mkdirSync } from 'node:fs'
import { ErrDaemonDisabled } from './errors/errors.js'

export class ProjectDaemonStatus {
  constructor(
    readonly alive: boolean,
    readonly pid: number | null,
    readonly socketPath: string,
    readonly enabled: boolean,
    readonly staleSocket: boolean,
  ) {}
}

export class ProjectDaemonEntry {
  constructor(
    readonly root: string,
    readonly hash: string,
    readonly status: "running" | "stopped" | "stale",
    readonly pid: number | null,
  ) {}
}


export class ProjectDaemonManager {
  constructor(private config: ProjectConfig) {}

  private get paths(){ return this.config.paths.daemon }

  status(): ProjectDaemonStatus {
    const paths = this.paths
    const pid = this.readPid();
    const alive = pid !== null && this.isProcessAlive(pid);

    return new ProjectDaemonStatus(
      alive,
      pid,
      paths.socket,
      !existsSync(paths.disabled),
      !alive && existsSync(paths.socket),
    );
  }

  start(): void {
    const paths = this.paths

    // Ensure daemon directory exists
    mkdirSync(paths.root, { recursive: true });

    if (existsSync(paths.disabled)) {
      throw ErrDaemonDisabled.create({});
    }

    const proc = Bun.spawn([
      ...process.argv.slice(0, 2),
      "--daemonized", "--project-root", this.config.paths.projectRootPath,
    ], {
      stdin: "ignore", stdout: "ignore", stderr: "inherit",
    });

    // Write PID file
    writeFileSync(paths.pid, String(proc.pid), {});

    proc.unref();
  }

  stop(): 'stopped' | 'not-running' {
    if (this.killDaemon()) {
      return 'stopped'
    }
    return 'not-running'
  }

  enable(): void {
    try { unlinkSync(this.paths.disabled); } catch { /* already enabled */ }
  }

  disable(): void {
    writeFileSync(this.paths.disabled, "");
    this.killDaemon();
  }

  list(): ProjectDaemonEntry[] {
    return this.discoverDaemons();
  }

  private discoverDaemons(): ProjectDaemonEntry[] {
    const daemonsDir = path.join(os.homedir(), ".max", "daemons");
    if (!existsSync(daemonsDir)) return [];

    const entries: ProjectDaemonEntry[] = [];
    for (const entry of readdirSync(daemonsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(daemonsDir, entry.name);
      const projectJsonPath = path.join(dir, "project.json");
      if (!existsSync(projectJsonPath)) continue;

      const data = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
      const pid = this.readPidFrom(path.join(dir, "daemon.pid"));
      const alive = pid !== null && this.isProcessAlive(pid);

      const status = alive ? "running" : pid !== null ? "stale" : "stopped";
      entries.push(new ProjectDaemonEntry(data.root, entry.name, status, pid));
    }
    return entries;
  }

  private readPid(): number | null {
    return this.readPidFrom(this.paths.pid);
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
    const paths = this.paths
    const pid = this.readPid();
    if (pid !== null && this.isProcessAlive(pid)) {
      try { process.kill(pid, "SIGTERM"); } catch { /* ignore */ }
      try { unlinkSync(paths.pid); } catch { /* ignore */ }
      try { unlinkSync(paths.socket); } catch { /* ignore */ }
      return true;
    }
    if (existsSync(paths.socket)) {
      try { unlinkSync(paths.socket); } catch { /* ignore */ }
    }
    return false;
  }
}
