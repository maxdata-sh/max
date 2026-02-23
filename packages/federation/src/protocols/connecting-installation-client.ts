/**
 * ConnectingInstallationClient — A lazy wrapper that defers deployment + start
 * to the first async method call.
 *
 * The registry always knows an installation exists (it's persisted). But
 * deploying and starting it is expensive and may not be needed for operations
 * like `ls` or `status`. This wrapper implements InstallationClient and
 * transparently connects on first real use.
 *
 * The sync `engine` property throws if accessed before connection — this is
 * a safety net, not a real code path. With targeting, handlers always trigger
 * connection via an async method (describe, schema, sync) before touching engine.
 */

import { HealthStatus, StartResult, StopResult } from '@max/core'
import type { Engine, InstallationScope, Schema } from '@max/core'
import type { SyncHandle } from '@max/execution'
import type { InstallationClient, InstallationDescription } from './installation-client.js'
import { ErrClientNotConnected } from '../errors/errors.js'

export class ConnectingInstallationClient implements InstallationClient {
  private _connected: Promise<InstallationClient> | undefined

  constructor(private readonly _connect: () => Promise<InstallationClient>) {}

  private ensure(): Promise<InstallationClient> {
    if (!this._connected) {
      this._connected = this._connect()
    }
    return this._connected
  }

  // -- Supervised -------------------------------------------------------

  async health(): Promise<HealthStatus> {
    if (!this._connected) return HealthStatus.unhealthy('not connected')
    return (await this._connected).health()
  }

  async start(): Promise<StartResult> {
    return (await this.ensure()).start()
  }

  async stop(): Promise<StopResult> {
    if (!this._connected) return StopResult.alreadyStopped()
    return (await this._connected).stop()
  }

  // -- InstallationClient -----------------------------------------------

  async describe(): Promise<InstallationDescription> {
    return (await this.ensure()).describe()
  }

  async schema(): Promise<Schema> {
    return (await this.ensure()).schema()
  }

  async sync(): Promise<SyncHandle> {
    return (await this.ensure()).sync()
  }

  get engine(): Engine<InstallationScope> {
    throw ErrClientNotConnected.create({ member: 'engine' })
  }
}
