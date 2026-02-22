import type { WorkspaceInfo } from './protocols/global-client.js'
import type { InstallationInfo } from './federation/installation-registry.js'
import type { HealthStatus, Printer } from '@max/core'

/** Known domain types that platforms can provide printers for. */
export interface PrintableTypes {
  "workspace-info": WorkspaceInfo
  "installation-info": InstallationInfo
  "health": HealthStatus
}

export type PrintableKey = keyof PrintableTypes

export type PlatformPrinters = {
  [K in PrintableKey]?: Printer<PrintableTypes[K]>
}
