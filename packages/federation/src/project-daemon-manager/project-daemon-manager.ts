export class ProjectDaemonStatus {
  constructor(
    readonly alive: boolean,
    readonly pid: number | null,
    readonly socketPath: string,
    readonly enabled: boolean,
    readonly staleSocket: boolean
  ) {}
}

export class ProjectDaemonEntry {
  constructor(
    readonly root: string,
    readonly hash: string,
    readonly status: 'running' | 'stopped' | 'stale',
    readonly pid: number | null
  ) {}
}

export interface ProjectDaemonManager {
  status(): ProjectDaemonStatus
  start(): void
  stop(): 'stopped' | 'not-running'
  enable(): void
  disable(): void
  list(): ProjectDaemonEntry[]
  discoverDaemons(): ProjectDaemonEntry[]
}

