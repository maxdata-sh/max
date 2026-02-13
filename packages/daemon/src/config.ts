import * as crypto from "node:crypto";
import * as path from "node:path";
import * as os from "node:os";

export function projectHash(projectRoot: string): string {
  const resolved = path.resolve(projectRoot);
  const hash = crypto.createHash("sha256").update(resolved).digest("hex");
  return hash.slice(0, 12);
}

interface DaemonPaths {
  readonly daemonDir: string;
  readonly socketPath: string;
  readonly pidPath: string;
  readonly disabledPath: string;
  readonly logPath: string;
}

export class DaemonConfig {
  readonly devMode: boolean;
  readonly projectRoot: string;
  readonly daemon: DaemonPaths;

  constructor(opts: { projectRoot: string; devMode?: boolean }) {
    this.projectRoot = path.resolve(opts.projectRoot);
    this.devMode = opts.devMode
      ?? (process.env.MAX_DEV === "1" || process.env.MAX_DEV === "true");

    const hash = projectHash(this.projectRoot);
    const daemonDir = path.join(os.homedir(), ".max", "daemons", hash);

    this.daemon = {
      daemonDir,
      socketPath: path.join(daemonDir, "daemon.sock"),
      pidPath: path.join(daemonDir, "daemon.pid"),
      disabledPath: path.join(daemonDir, "daemon.disabled"),
      logPath: path.join(daemonDir, "daemon.log"),
    };
  }
}
