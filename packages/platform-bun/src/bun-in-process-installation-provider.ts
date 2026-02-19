/**
 * BunInProcessInstallationProvider — Platform-specific installation provider for Bun.
 *
 * Resolves InstallationSpec → concrete dependencies using Bun-native
 * implementations (bun:sqlite for engine/task store/sync meta, node:fs
 * for credential store). Then delegates to bootstrapInstallation() for
 * platform-invariant wiring.
 *
 * Resolution is this provider's job. Wiring is bootstrap's job.
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import {
  type Engine,
  type SyncMeta,
  type ProviderKind,
  type Schema,
  type UnlabelledHandle,
} from '@max/core'
import type { ConnectorRegistry, CredentialStore } from '@max/connector'
import type {
  EngineConfig,
  CredentialStoreConfig,
  InstallationClient,
  InstallationNodeProvider,
  InstallationSpec,
} from '@max/federation'
import type { TaskStore } from '@max/execution'
import { bootstrapInstallation, ErrConnectNotSupported, ErrUnsupportedConfig } from '@max/federation'
import { SqliteEngine } from '@max/storage-sqlite'
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from '@max/execution-sqlite'
import { FsCredentialStore } from './fs-credential-store.js'

const BUN_IN_PROCESS_KIND: ProviderKind = 'in-process'

export class BunInProcessInstallationProvider implements InstallationNodeProvider {
  readonly kind = BUN_IN_PROCESS_KIND

  constructor(
    private readonly connectorRegistry: ConnectorRegistry,
    private readonly dataRoot: string,
  ) {}

  async create(spec: InstallationSpec): Promise<UnlabelledHandle<InstallationClient>> {
    const name = spec.name ?? spec.connector
    const installDir = path.join(this.dataRoot, spec.connector, name)

    // Ensure the installation directory exists
    fs.mkdirSync(installDir, { recursive: true })

    // -- Resolution (platform-specific) --

    const connector = await this.connectorRegistry.resolve(spec.connector)
    const engine = this.resolveEngine(spec.engine ?? { type: "sqlite" }, installDir, connector.def.schema)
    const credentialStore = this.resolveCredentialStore(spec.credentials ?? { type: "fs" }, installDir)

    // Persist pre-collected credentials (from atomic connect flow)
    if (spec.initialCredentials) {
      for (const [key, value] of Object.entries(spec.initialCredentials)) {
        await credentialStore.set(key, value)
      }
    }

    const taskStore = this.resolveTaskStore(engine)
    const syncMeta = this.resolveSyncMeta(engine)

    // -- Wiring (platform-invariant) --

    const client = bootstrapInstallation({
      connectorType: spec.connector,
      name,
      connector,
      engine,
      credentialStore,
      taskStore,
      syncMeta,
      connectorConfig: spec.connectorConfig,
    })

    return { providerKind: BUN_IN_PROCESS_KIND, client }
  }

  async connect(_location: unknown): Promise<UnlabelledHandle<InstallationClient>> {
    throw ErrConnectNotSupported.create({ providerKind: 'in-process' })
  }

  // --------------------------------------------------------------------------
  // Resolution — maps abstract config → concrete Bun implementations
  // --------------------------------------------------------------------------

  private resolveEngine(config: EngineConfig, installDir: string, schema: Schema): Engine {
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
  }

  private resolveCredentialStore(config: CredentialStoreConfig, installDir: string): CredentialStore {
    switch (config.type) {
      case "fs": {
        const filePath = 'path' in config ? config.path : path.join(installDir, 'credentials.json')
        return new FsCredentialStore(filePath)
      }
      case "in-memory":
        throw ErrUnsupportedConfig.create({ kind: "CredentialStore", configType: "in-memory" })
      case "vault":
        throw ErrUnsupportedConfig.create({ kind: "CredentialStore", configType: "vault" })
    }
  }

  private resolveTaskStore(engine: Engine): TaskStore {
    const sqliteEngine = engine as SqliteEngine
    return new SqliteTaskStore(sqliteEngine.db)
  }

  private resolveSyncMeta(engine: Engine): SyncMeta {
    const sqliteEngine = engine as SqliteEngine
    return new SqliteSyncMeta(sqliteEngine.db)
  }
}
