/**
 * BunInProcessProvider — Platform-specific installation provider for Bun.
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
import { type ProviderKind, type UnlabelledHandle } from '@max/core'
import type { ConnectorRegistry } from '@max/connector'
import type {
  InstallationClient,
  InstallationNodeProvider,
  InstallationSpec,
} from '@max/federation'
import { bootstrapInstallation, ErrConnectNotSupported } from '@max/federation'
import { SqliteEngine } from '@max/storage-sqlite'
import { SqliteExecutionSchema, SqliteSyncMeta, SqliteTaskStore } from '@max/execution-sqlite'
import { FsCredentialStore } from './fs-credential-store.js'

const BUN_IN_PROCESS_KIND: ProviderKind = 'in-process'

export class BunInProcessProvider implements InstallationNodeProvider {
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

    // Engine
    const dbPath = path.join(installDir, 'data.db')
    const engine = SqliteEngine.open(dbPath, connector.def.schema)
    new SqliteExecutionSchema().ensureTables(engine.db)

    // Stores
    const taskStore = new SqliteTaskStore(engine.db)
    const syncMeta = new SqliteSyncMeta(engine.db)

    // Credentials
    const credentialStore = new FsCredentialStore(path.join(installDir, 'credentials.json'))

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
}
