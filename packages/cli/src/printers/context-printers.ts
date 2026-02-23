/**
 * Printers for ls and status output.
 *
 * Each printer takes a self-contained view model and produces
 * the complete formatted output, including the context header.
 */

import { Fmt, HealthStatus, MaxUrl, Printer } from '@max/core'
import type { WorkspaceListEntry, InstallationDescription } from '@max/federation'

// ============================================================================
// Shared helpers
// ============================================================================

function contextHeader(url: MaxUrl, fmt: Fmt): string {
  const name = url.installation ?? url.workspace ?? url.host
  return ` ${fmt.bold(name)} ${fmt.dim(`(${url})`)}`
}

function healthIndicator(health: HealthStatus, fmt: Fmt): string {
  switch (health.status) {
    case 'healthy':  return fmt.green('●')
    case 'degraded':  return fmt.yellow('●')
    case 'unhealthy': return fmt.red('●')
  }
}

function healthLabel(health: HealthStatus, fmt: Fmt): string {
  const indicator = healthIndicator(health, fmt)
  const label = health.status === 'healthy' ? fmt.green(health.status) :
                health.status === 'degraded' ? fmt.yellow(health.status) :
                fmt.red(health.status)
  const reason = health.reason ? fmt.dim(` (${health.reason})`) : ''
  return `${indicator} ${label}${reason}`
}

function formatTable(headers: string[], rows: string[][], fmt: Fmt): string {
  if (rows.length === 0) return ''
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  )
  const header = '  ' + headers.map((h, i) => fmt.dim(h.padEnd(widths[i]))).join('  ')
  const body = rows
    .map(r => '  ' + r.map((c, i) => c.padEnd(widths[i])).join('  '))
    .join('\n')
  return header + '\n' + body
}

// ============================================================================
// ls
// ============================================================================

export interface LsGlobalView {
  url: MaxUrl
  workspaces: WorkspaceListEntry[]
}

export const LsGlobalPrinter = Printer.define<LsGlobalView>((view, fmt) => {
  const lines: string[] = [contextHeader(view.url, fmt), '']

  if (view.workspaces.length === 0) {
    lines.push('  No workspaces.')
    return Printer.lines(lines)
  }

  const rows = view.workspaces.map(ws => [
    ws.name,
    view.url.child(ws.name).toString(),
    healthLabel(ws.health, fmt),
  ])

  lines.push(formatTable(['NAME', 'URL', 'STATUS'], rows, fmt))
  return Printer.lines(lines)
})

export interface LsInstallationRow {
  name: string
  health: HealthStatus
}

export interface LsWorkspaceView {
  url: MaxUrl
  installations: LsInstallationRow[]
}

export const LsWorkspacePrinter = Printer.define<LsWorkspaceView>((view, fmt) => {
  const lines: string[] = [contextHeader(view.url, fmt), '']

  if (view.installations.length === 0) {
    lines.push('  No installations.')
    return Printer.lines(lines)
  }

  const rows = view.installations.map(inst => [
    inst.name,
    view.url.child(inst.name).toString(),
    healthLabel(inst.health, fmt),
  ])

  lines.push(formatTable(['NAME', 'URL', 'STATUS'], rows, fmt))
  return Printer.lines(lines)
})

// ============================================================================
// status
// ============================================================================

export interface StatusGlobalView {
  url: MaxUrl
  health: HealthStatus
  workspaces: WorkspaceListEntry[]
}

export const StatusGlobalPrinter = Printer.define<StatusGlobalView>((view, fmt) => {
  const lines: string[] = [contextHeader(view.url, fmt), '']

  lines.push(`  ${fmt.normal('Status:')}      ${healthLabel(view.health, fmt)}`)
  lines.push(`  ${fmt.normal('Workspaces:')}  ${view.workspaces.length}`)
  lines.push('')

  for (const ws of view.workspaces) {
    lines.push(`  ${ws.name.padEnd(20)} ${healthLabel(ws.health, fmt)}`)
  }

  return Printer.lines(lines)
})

export interface StatusInstallationRow {
  name: string
  connector: string
  health: HealthStatus
}

export interface StatusWorkspaceView {
  url: MaxUrl
  health: HealthStatus
  installations: StatusInstallationRow[]
}

export const StatusWorkspacePrinter = Printer.define<StatusWorkspaceView>((view, fmt) => {
  const lines: string[] = [contextHeader(view.url, fmt), '']

  lines.push(`  ${fmt.normal('Status:')}         ${healthLabel(view.health, fmt)}`)
  lines.push(`  ${fmt.normal('Installations:')}  ${view.installations.length}`)
  lines.push('')

  for (const inst of view.installations) {
    lines.push(`  ${inst.name.padEnd(20)} ${healthLabel(inst.health, fmt).padEnd(20)} ${fmt.dim(inst.connector)}`)
  }

  return Printer.lines(lines)
})

export interface StatusInstallationView {
  url: MaxUrl
  health: HealthStatus
  description: InstallationDescription
}

export const StatusInstallationPrinter = Printer.define<StatusInstallationView>((view, fmt) => {
  const entityCount = view.description.schema.entities.length
  const fieldCount = view.description.schema.entities.reduce(
    (sum, e) => sum + Object.keys(e.fields).length, 0
  )

  const lines: string[] = [contextHeader(view.url, fmt), '']
  lines.push(`  ${fmt.normal('Connector:')}  ${view.description.connector}`)
  lines.push(`  ${fmt.normal('Status:')}     ${healthLabel(view.health, fmt)}`)
  lines.push(`  ${fmt.normal('Schema:')}     ${entityCount} entities, ${fieldCount} fields`)

  return Printer.lines(lines)
})
