import * as path from 'node:path'
import * as os from 'node:os'
import {useColor} from "./util/use-color.js";

type ExecutionMode = 'daemon' | 'direct'

export class GlobalConfig {
  readonly devMode: boolean
  readonly workspaceRoot: string | null // Have we been supplied a project root?
  readonly cwd: string // What is our working directory?
  readonly mode: ExecutionMode // What mode are we in?
  readonly maxHomeDirectory: string
  readonly useColor?: boolean

  constructor(opts: {
    useColor?: boolean
    devMode?: boolean
    workspaceRoot?: string
    cwd?: string
    mode: ExecutionMode
  }) {
    this.devMode = opts.devMode ?? (process.env.MAX_DEV === '1' || process.env.MAX_DEV === 'true')

    this.workspaceRoot = opts.workspaceRoot ?? null

    this.cwd = opts.cwd ?? process.cwd()

    this.mode = opts.mode

    this.maxHomeDirectory = path.join(os.homedir(), '.max')

    this.useColor = opts.useColor ?? useColor()
  }
}
