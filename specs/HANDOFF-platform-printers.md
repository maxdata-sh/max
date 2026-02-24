# Handoff: Platform Printers

## Goal

Allow platforms to provide printers for known domain types. The federation layer defines *what* can be printed (a `PrintableTypes` map). The platform defines *how* (optional `Printer<T>` implementations). Consumers use either a string key (platform lookup) or a direct `Printer` (existing pattern).

## Dependency

Implement after `HANDOFF-deployer-kind-branded-config.md` — that spec restructures the Platform interface.

## Design

### Client code

```typescript
// Key-based — platform resolves the printer
formatter.print("workspace-info", workspaceInfo)
formatter.printList("installation-info", installations)

// Direct — existing pattern, unchanged
formatter.printVia(SchemaPrinters.SchemaText, schema)
```

### Federation layer — printable type registry

**File:** New export from `packages/federation/src/printable-types.ts` (or similar)

```typescript
import type { WorkspaceInfo } from './protocols/global-client.js'
import type { InstallationInfo } from './federation/installation-registry.js'
import type { HealthStatus } from '@max/core'

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
```

Export from `packages/federation/src/index.ts`.

### Platform interface

**File:** `packages/federation/src/platform/platform.ts`

Add optional `printers` to the Platform interface:

```typescript
export interface Platform {
  // ...existing fields...
  printers?: PlatformPrinters
}
```

### BunPlatform

**File:** `packages/platform-bun/src/bun-platform.ts`

Add printer implementations to the platform definition:

```typescript
export const BunPlatform = Platform.define({
  // ...existing...
  printers: {
    "workspace-info": Printer.define<WorkspaceInfo>((ws, fmt) =>
      `${fmt.bold(ws.name)} (${ws.id}) — connected ${ws.connectedAt}`
    ),
    "installation-info": Printer.define<InstallationInfo>((inst, fmt) =>
      `${fmt.bold(inst.name)} [${inst.connector}] (${inst.id})`
    ),
  },
})
```

The existing skeleton `WorkspaceEntryPrinter` in `packages/platform-bun/src/printers/workspace-printers.ts` can be moved here or referenced from here.

### PrintFormatter extension

**File:** `packages/core/src/printable.ts` (where `Printer` and `PrintFormatter` live)

Add overloaded `print` / `printList` methods:

```typescript
class PrintFormatter {
  constructor(fmt: Fmt, private platformPrinters?: PlatformPrinters) {}

  // Key-based lookup
  print<K extends PrintableKey>(key: K, value: PrintableTypes[K]): string
  // Direct printer (existing)
  print<T>(printer: Printer<T>, value: T): string
  // Implementation
  print(printerOrKey: any, value: any): string {
    const printer = typeof printerOrKey === 'string'
      ? this.platformPrinters?.[printerOrKey]
      : printerOrKey
    if (!printer) throw new Error(`No printer registered for "${printerOrKey}"`)
    return printer.print(value, this.fmt)
  }

  // Same pattern for lists
  printList<K extends PrintableKey>(key: K, values: PrintableTypes[K][]): string
  printList<T>(printer: Printer<T>, values: T[]): string
  printList(printerOrKey: any, values: any[]): string {
    const printer = typeof printerOrKey === 'string'
      ? this.platformPrinters?.[printerOrKey]
      : printerOrKey
    if (!printer) throw new Error(`No printer registered for "${printerOrKey}"`)
    return values.map(v => printer.print(v, this.fmt)).join('\n')
  }
}
```

The existing `printVia` / `printListVia` methods remain unchanged as aliases for the direct-printer path.

### CLI wiring

**File:** `packages/cli/src/index.ts`

Construct `PrintFormatter` with platform printers:

```typescript
private getPrintFormatter(color: boolean): PrintFormatter {
  const fmt = color ? Fmt.ansi : Fmt.plain
  return new PrintFormatter(fmt, BunPlatform.printers)
}
```

Replace the `runDaemon` list case (`BunPlatform.printers.WorkspaceEntry` reference):

```typescript
case 'list': {
  const printer = this.getPrintFormatter(_color)
  const g = await this.getGlobalMax()
  const w = await g.listWorkspaces()
  return printer.printList("workspace-info", w)
}
```

## What stays as direct printers

Schema printing has multiple output formats (text, json, ndjson) — it stays as direct `Printer` instances in the CLI (`SchemaPrinters.SchemaText`, etc.), passed via `printVia`. Only domain types that have a single "natural" representation go into `PrintableTypes`.
