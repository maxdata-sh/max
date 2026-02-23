import { Printer } from '@max/core'
import { WorkspaceInfo, WorkspaceListEntry, WorkspaceRegistryEntry } from '@max/federation'

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


export const WorkspaceInfoPrinter = Printer.define<WorkspaceInfo>((ws, fmt) =>
  Printer.lines([
    fmt.underline(ws.name),
    `  ${fmt.normal('Id:')}    ${ws.id}`,
    `  ${fmt.normal('Since:')} ${ws.connectedAt}`,
  ])
)

export const WorkspaceListEntryPrinter = Printer.define<WorkspaceListEntry>((ws, fmt) => {
  const indicator =
    ws.health.status === 'healthy'
      ? fmt.green('●')
      : ws.health.status === 'degraded'
        ? fmt.yellow('●')
        : fmt.yellow('○')
  const label =
    ws.health.status === 'healthy'
      ? fmt.green('healthy')
      : ws.health.status === 'degraded'
        ? fmt.yellow(`degraded${ws.health.reason ? ` — ${ws.health.reason}` : ''}`)
        : fmt.yellow('not connected')
  return Printer.lines([
    fmt.underline(ws.name),
    `  ${fmt.normal('Id:')}     ${ws.id}`,
    `  ${fmt.normal('Status:')} ${indicator} ${label}`,
    `  ${fmt.normal('Since:')}  ${ws.connectedAt}`,
  ])
})
