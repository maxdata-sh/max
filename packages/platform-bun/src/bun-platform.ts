/**
 * BunPlatform — Strongly-typed entry point for the Bun platform.
 *
 * Providers are capabilities of the platform, not independent abstractions.
 * This object exposes what Bun can do: in-process hosting, subprocess hosting,
 * and direct infrastructure resolution for testing/advanced use.
 *
 * Usage:
 *   import { BunPlatform } from "@max/platform-bun"
 *
 *   BunPlatform.installation.inProcess(config)   // → InstallationNodeProvider
 *   BunPlatform.installation.subprocess(config)   // → InstallationNodeProvider
 *   BunPlatform.installation.fromConfig(config)   // hydrate from serialised config
 *   BunPlatform.workspace.inProcess(config)       // → WorkspaceNodeProvider
 *   BunPlatform.resolve.engine(config)            // direct infrastructure access
 */

import * as path from 'node:path'
import type { Engine, Schema, SyncMeta } from '@max/core'
import type { ConnectorRegistry, CredentialStore } from '@max/connector'
import type {
  InstallationNodeProvider,
  WorkspaceNodeProvider,
  EngineConfig,
  CredentialStoreConfig,
} from '@max/federation'
import type { TaskStore } from '@max/execution'
import { ErrUnsupportedConfig } from '@max/federation'
import { SqliteEngine } from '@max/storage-sqlite'
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from '@max/execution-sqlite'
import { FsCredentialStore } from './fs-credential-store.js'
import { BunInProcessInstallationProvider } from './bun-in-process-installation-provider.js'
import { SubprocessInstallationProvider } from './subprocess-installation-provider.js'
import { BunInProcessWorkspaceProvider } from './bun-in-process-workspace-provider.js'
import type { BunWorkspaceConfig } from './bun-in-process-workspace-provider.js'

// ============================================================================
// Installation config types
// ============================================================================

export interface BunInProcessInstallationConfig {
  /** Directory containing installation data (SQLite DBs, credential stores). */
  readonly dataDir: string
  /** Connector registry for resolving connector modules. */
  readonly connectorRegistry: ConnectorRegistry
}

export interface BunSubprocessInstallationConfig {
  /** Directory containing installation data, passed to child processes. */
  readonly dataDir: string
}

export type BunInstallationHosting =
  | ({ strategy: "in-process" } & BunInProcessInstallationConfig)
  | ({ strategy: "subprocess" } & BunSubprocessInstallationConfig)

// ============================================================================
// Workspace config types
// ============================================================================

export interface BunInProcessWorkspaceConfig {
  /** Project root path (directory containing max.json and .max/). */
  readonly projectRoot: string
  /** Connector module map (name → import path). */
  readonly connectors: Record<string, string>
}

export type BunWorkspaceHosting =
  | ({ strategy: "in-process" } & BunInProcessWorkspaceConfig)

// ============================================================================
// Engine config types
// ============================================================================

export type BunEngineConfig =
  | { type: "sqlite" }
  | { type: "sqlite", path: string }
  | { type: "sqlite", pragmas: Record<string, string> }

export type BunCredentialStoreConfig =
  | { type: "fs" }
  | { type: "fs", path: string }

// ============================================================================
// BunPlatform
// ============================================================================

export const BunPlatform = {

  installation: {
    /** Create an in-process installation provider using bun:sqlite and node:fs. */
    inProcess(config: BunInProcessInstallationConfig): InstallationNodeProvider {
      return new BunInProcessInstallationProvider(config.connectorRegistry, config.dataDir)
    },

    /** Create a subprocess installation provider that spawns Bun child processes. */
    subprocess(config: BunSubprocessInstallationConfig): InstallationNodeProvider {
      return new SubprocessInstallationProvider({ dataRoot: config.dataDir })
    },

    /** Hydrate from serialised config (e.g., from a JSON file or persisted registry). */
    fromConfig(config: BunInstallationHosting): InstallationNodeProvider {
      switch (config.strategy) {
        case "in-process": return BunPlatform.installation.inProcess(config)
        case "subprocess": return BunPlatform.installation.subprocess(config)
      }
    },
  },

  workspace: {
    /** Create an in-process workspace provider backed by filesystem (max.json). */
    inProcess(config: BunInProcessWorkspaceConfig): WorkspaceNodeProvider<BunWorkspaceConfig> {
      return new BunInProcessWorkspaceProvider()
    },

    /** Hydrate from serialised config. */
    fromConfig(config: BunWorkspaceHosting): WorkspaceNodeProvider<BunWorkspaceConfig> {
      switch (config.strategy) {
        case "in-process": return BunPlatform.workspace.inProcess(config)
      }
    },
  },

  /** Resolve individual infrastructure components (for advanced use / testing). */
  resolve: {
    /** Resolve an engine from config. */
    engine(config: EngineConfig, schema: Schema, installDir: string): Engine {
      switch (config.type) {
        case "sqlite": {
          const dbPath = 'path' in config ? config.path : path.join(installDir, 'data.db')
          const engine = SqliteEngine.open(dbPath, schema)
          new SqliteExecutionSchema().ensureTables(engine.db)
          return engine
        }
        case "in-memory": {
          const engine = SqliteEngine.open(':memory:', schema)
          new SqliteExecutionSchema().ensureTables(engine.db)
          return engine
        }
        case "postgres":
          throw ErrUnsupportedConfig.create({ kind: "Engine", configType: "postgres" })
      }
    },

    /** Resolve a task store from a previously resolved engine. */
    taskStore(engine: Engine): TaskStore {
      const sqliteEngine = engine as SqliteEngine
      return new SqliteTaskStore(sqliteEngine.db)
    },

    /** Resolve sync metadata from a previously resolved engine. */
    syncMeta(engine: Engine): SyncMeta {
      const sqliteEngine = engine as SqliteEngine
      return new SqliteSyncMeta(sqliteEngine.db)
    },

    /** Resolve a credential store from config. */
    credentialStore(config: CredentialStoreConfig, baseDir: string): CredentialStore {
      switch (config.type) {
        case "fs": {
          const filePath = 'path' in config ? config.path : path.join(baseDir, 'credentials.json')
          return new FsCredentialStore(filePath)
        }
        case "in-memory":
          throw ErrUnsupportedConfig.create({ kind: "CredentialStore", configType: "in-memory" })
        case "vault":
          throw ErrUnsupportedConfig.create({ kind: "CredentialStore", configType: "vault" })
      }
    },
  },

} as const
