import { WorkspaceRegistryEntry } from '@max/federation'
import { Printer } from '@max/core'

export const WorkspacePrinters = {
  // DaemonStatus: CliValuePrinter.of<any>((value, fmt) => {
  //   const lines: string[] = []
  //   if (value.alive) {
  //     lines.push(
  //       `${fmt.normal('Daemon:')}  ${fmt.green('● running')} ${fmt.dim(`(pid ${value.pid})`)}`
  //     )
  //     lines.push(`${fmt.normal('Socket:')}  ${value.socketPath}`)
  //   } else {
  //     lines.push(`${fmt.normal('Daemon:')}  ${fmt.yellow('○ not running')}`)
  //     if (value.staleSocket)
  //       lines.push(`${fmt.yellow('Warning:')} stale socket at ${value.socketPath}`)
  //   }
  //   lines.push(`${fmt.normal('Enabled:')} ${value.enabled ? fmt.green('✓ yes') : fmt.red('x no')}`)
  //   return lines.join('\n')
  // }),

  // FIXME: We'll need to make this a Bun platform concern. Only it knows haw to print its own daemon entries
  WorkspaceEntry: Printer.define<WorkspaceRegistryEntry>((value, fmt) => {
    const indicator = 'x'
    // value.status === 'running' ? fmt.green('●') : value.status === 'stale' ? fmt.red('●') : '○'
    // const label =
    //   value.status === 'running'
    //     ? `${fmt.green('running')} ${fmt.dim(`(pid ${value.pid})`)}`
    //     : value.status
    const label = value.connectedAt

    return JSON.stringify(value)

    // return [
    //   fmt.underline(value.root),
    //   `  ${fmt.normal('Hash:')}   ${value.hash}`,
    //   `  ${fmt.normal('Status:')} ${indicator} ${label}`,
    // ].join('\n')
  }),
}
