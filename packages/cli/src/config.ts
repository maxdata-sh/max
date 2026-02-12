export interface DaemonConfig {
  readonly devMode: boolean;
  readonly daemon: {
    readonly tmpRoot: string;
    readonly socketPath: string;
    readonly pidPath: string;
    readonly disabledPath: string;
    readonly logPath: string;
  };
}

export const DaemonConfig = {
  build(overrides: Partial<{ devMode: boolean; daemon: { tmpRoot: string } }> = {}): DaemonConfig {
    const devMode = overrides.devMode
      ?? (process.env.MAX_DEV === "1" || process.env.MAX_DEV === "true");

    const tmpRoot = overrides.daemon?.tmpRoot
      ?? process.env.MAX_DAEMON_TMP
      ?? "/tmp";

    return {
      devMode,
      daemon: {
        tmpRoot,
        socketPath: `${tmpRoot}/max-daemon.sock`,
        pidPath: `${tmpRoot}/max-daemon.pid`,
        disabledPath: `${tmpRoot}/max-daemon.disabled`,
        logPath: `${tmpRoot}/max-daemon.log`,
      },
    };
  },
};
