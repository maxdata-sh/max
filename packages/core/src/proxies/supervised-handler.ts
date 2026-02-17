/**
 * SupervisedHandler — Receiver-side mirror of SupervisedProxy.
 *
 * Dispatches health/start/stop to the real Supervised implementation.
 * Co-located with SupervisedProxy in @max/core.
 */

import type { Supervised } from "../federation/supervised.js"
import { ErrUnknownMethod } from "../federation/rpc-errors.js"

export class SupervisedHandler {
  constructor(private readonly supervised: Supervised) {}

  dispatch(method: string, _args: readonly unknown[]): Promise<unknown> {
    switch (method) {
      case "health":
        return this.supervised.health()
      case "start":
        return this.supervised.start()
      case "stop":
        return this.supervised.stop()
      default:
        throw ErrUnknownMethod.create({ target: "", method })
    }
  }
}
