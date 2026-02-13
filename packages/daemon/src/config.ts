import { Lazy } from "@max/core";
import { findProjectRoot } from "./project-manager/find-project-root.js";
import { ErrProjectNotInitialised } from "./project-manager/errors.js";

interface DaemonPaths {
  readonly tmpRoot: string;
  readonly socketPath: string;
  readonly pidPath: string;
  readonly disabledPath: string;
  readonly logPath: string;
}

export class DaemonConfig {
  readonly devMode: boolean;
  readonly daemon: DaemonPaths;

  private lazy = new Lazy({
    maxProjectRoot: () => {
      const root = findProjectRoot(process.cwd());
      if (!root) throw ErrProjectNotInitialised.create({ path: process.cwd() });
      return root;
    },
  });

  project = {
    getMaxProjectRoot: () => this.lazy.read.maxProjectRoot,
  };

  constructor(opts: Partial<{ devMode: boolean; daemon: { tmpRoot: string } }> = {}) {
    this.devMode = opts.devMode
      ?? (process.env.MAX_DEV === "1" || process.env.MAX_DEV === "true");

    const tmpRoot = opts.daemon?.tmpRoot
      ?? process.env.MAX_DAEMON_TMP
      ?? "/tmp";

    this.daemon = {
      tmpRoot,
      socketPath: `${tmpRoot}/max-daemon.sock`,
      pidPath: `${tmpRoot}/max-daemon.pid`,
      disabledPath: `${tmpRoot}/max-daemon.disabled`,
      logPath: `${tmpRoot}/max-daemon.log`,
    };
  }
}
