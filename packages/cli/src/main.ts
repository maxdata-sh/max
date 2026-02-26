/**
 * CLI harness — process-level entry point.
 *
 * Handles subprocess mode, daemon mode, and direct mode. All
 * process-level concerns (argv parsing, PID files, socket server,
 * process.exit) live here. The CLI class in cli.ts is pure logic.
 */

import { BunPlatform, GlobalConfig } from '@max/platform-bun'
import { flag, parseSync, passThrough } from '@optique/core'
import { object } from '@optique/core/constructs'
import { withDefault } from '@optique/core/modifiers'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

import { MaxError } from '@max/core'
import { createSocketServer } from './socket-server.js'
import { CliRequest } from './types.js'
import { runSubprocess, subprocessParsers } from './subprocess-entry.js'
import * as util from 'node:util'
import { CLI } from './cli.js'

/** Write data in 64 KB chunks, awaiting flush on each to avoid truncation when piped. */
async function flushWrite(stream: NodeJS.WritableStream, data: string): Promise<void> {
  const CHUNK = 65536
  let offset = 0
  while (offset < data.length) {
    const chunk = data.slice(offset, offset + CHUNK)
    offset += CHUNK
    await new Promise<void>((resolve, reject) => {
      stream.write(chunk, (err) => (err ? reject(err) : resolve()))
    })
  }
}

/** Global daemon paths — ~/.max/daemon.{sock,pid,log} */
function globalDaemonPaths() {
  const dir = path.join(os.homedir(), '.max')
  return {
    root: dir,
    socket: path.join(dir, 'daemon.sock'),
    pid: path.join(dir, 'daemon.pid'),
    log: path.join(dir, 'daemon.log'),
  }
}

export async function main() {
  // ---- Subprocess mode — early exit if --subprocess is present ----

  const subprocessParsed = parseSync(subprocessParsers, process.argv.slice(2))
  if (subprocessParsed.success && subprocessParsed.value.subprocess) {
    await runSubprocess(subprocessParsed.value)
    return
  }

  // ---- Normal CLI mode ----

  const rustShimParsers = object({
    devMode: withDefault(flag('--dev-mode'), () => process.env.MAX_DEV_MODE === 'true'),
    daemonized: withDefault(flag('--daemonized'), false),
    maxCommand: passThrough({ format: 'greedy' }),
  })

  const parsed = parseSync(rustShimParsers, process.argv.slice(2))

  if (!parsed.success) {
    console.error('Unexpected error')
    throw new Error(parsed.error.join('\n'))
  }

  const cfg = new GlobalConfig({
    devMode: parsed.value.devMode,
    cwd: process.cwd(),
    mode: parsed.value.daemonized ? 'daemon' : 'direct',
  })

  const cli = new CLI(cfg)

  if (cfg.mode === 'daemon') {
    const daemonPaths = globalDaemonPaths()

    // Guard: check if daemon is already running (read PID, check liveness)
    try {
      const pidRaw = fs.readFileSync(daemonPaths.pid, 'utf-8').trim()
      const existingPid = parseInt(pidRaw, 10)
      if (!isNaN(existingPid)) {
        try {
          process.kill(existingPid, 0) // signal 0 = liveness check
          console.error(`Daemon already running (pid ${existingPid})`)
          process.exit(0)
        } catch {
          // Process not alive — stale PID file, continue startup
        }
      }
    } catch {
      // No PID file — continue startup
    }

    // Write our own PID
    fs.mkdirSync(daemonPaths.root, { recursive: true })
    fs.writeFileSync(daemonPaths.pid, String(process.pid))

    // Start GlobalMax eagerly — reconcile persisted workspaces before accepting requests
    const globalMax = await cli.lazy.globalStarted
    const workspaces = await globalMax.listWorkspaces()
    console.log(`Reconciled ${workspaces.length} workspace(s)`)

    createSocketServer({
      socketPath: daemonPaths.socket,
      handler: (req, prompter) =>
        cli.execute(req, prompter).catch((err) => {
          const color = req.color ?? false
          const msg = MaxError.isMaxError(err) ? err.prettyPrint({ color }) : util.inspect(err)
          return { stderr: `${msg}\n`, exitCode: 1 }
        }),
    })

    console.log(`Max daemon listening on ${daemonPaths.socket}`)
  } else {
    // ---- Direct mode ----

    const req: CliRequest = {
      kind: 'run',
      argv: parsed.value.maxCommand,
      cwd: process.cwd(),
      color: cfg.useColor,
      shell: process.env.SHELL
    }

    const response = await cli.execute(req).catch((err) => {
      console.error(err)
      process.exit(1)
    })

    const writes: Promise<void>[] = []
    if (response.completionOutput) writes.push(flushWrite(process.stdout, response.completionOutput))
    if (response.stdout) writes.push(flushWrite(process.stdout, response.stdout))
    if (response.stderr) writes.push(flushWrite(process.stderr, response.stderr))
    await Promise.all(writes)

    process.exit(response.exitCode)
  }
}
