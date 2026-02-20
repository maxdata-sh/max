import * as crypto from "node:crypto";
import path from "node:path";
import {GlobalConfig} from "./global-config.js";

export function projectHash(projectRoot: string): string {
  const resolved = path.resolve(projectRoot);
  const hash = crypto.createHash("sha256").update(resolved).digest("hex");
  return hash.slice(0, 12);
}

interface DaemonPaths {
  readonly root: string;
  readonly socket: string;
  readonly pid: string;
  readonly disabled: string;
  readonly log: string;
}

export class ProjectConfig {
  readonly global: GlobalConfig
  readonly paths: {
    projectRootPath: string,
    daemon: DaemonPaths
  }

  constructor(global: GlobalConfig, opts: {
    projectRootFolder: string

  }) {
    this.global = global
    const hash = projectHash(opts.projectRootFolder);
    const daemonDir = path.join(global.maxHomeDirectory, 'daemons',hash)

    this.paths = {
      projectRootPath: opts.projectRootFolder,
      daemon: {
        root: daemonDir,
        socket: path.join(daemonDir, "daemon.sock"),
        pid: path.join(daemonDir, "daemon.pid"),
        disabled: path.join(daemonDir, "daemon.disabled"),
        log: path.join(daemonDir, "daemon.log"),
      }
    }

  }
}
