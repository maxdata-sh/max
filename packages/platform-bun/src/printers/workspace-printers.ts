
// export const DaemonPrinters = {
//   DaemonStatus: CliValuePrinter.of<ProjectDaemonStatus>((value, fmt) => {
//     const lines: string[] = []
//     if (value.alive) {
//       lines.push(
//         `${fmt.normal('Daemon:')}  ${fmt.green('● running')} ${fmt.dim(`(pid ${value.pid})`)}`
//       )
//       lines.push(`${fmt.normal('Socket:')}  ${value.socketPath}`)
//     } else {
//       lines.push(`${fmt.normal('Daemon:')}  ${fmt.yellow('○ not running')}`)
//       if (value.staleSocket)
//         lines.push(`${fmt.yellow('Warning:')} stale socket at ${value.socketPath}`)
//     }
//     lines.push(`${fmt.normal('Enabled:')} ${value.enabled ? fmt.green('✓ yes') : fmt.red('x no')}`)
//     return lines.join('\n')
//   }),


import { Printer } from '@max/core'
import { WorkspaceRegistryEntry } from '@max/federation'

export const WorkspaceEntryPrinter = Printer.define<WorkspaceRegistryEntry>((value, fmt) => {
  // const indicator =
  //   value.status === 'running' ? fmt.green('●') : value.status === 'stale' ? fmt.red('●') : '○'
  //
  // const label =
  //   value.status === 'running'
  //     ? `${fmt.green('running')} ${fmt.dim(`(pid ${value.pid})`)}`
  //     : value.status

  const indicator = 'woop'
  const label = 'no'

  return Printer.lines([
    fmt.underline(value.name),
    `  ${fmt.normal('Hash:')}   ${'no hash'}`,
    `  ${fmt.normal('Status:')} ${indicator} ${label}`,
  ])
})
